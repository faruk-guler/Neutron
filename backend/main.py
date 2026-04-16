"""Neutron Web - FastAPI Backend"""
import os
import json
import yaml
import asyncio
import logging
import shutil
from pathlib import Path
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import List, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, UploadFile, File, Form, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel

from models import Base, Host, CommandHistory, Playbook
from ssh_manager import pool, SSHConnection
from commands import (
    execute_command_parallel, execute_command_single,
    upload_file_parallel, download_file_parallel, run_playbook
)

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./neutron.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create tables
Base.metadata.create_all(bind=engine)

# Config
BASE_DIR = Path(__file__).parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
DOWNLOAD_DIR = BASE_DIR / "downloads"
UPLOAD_DIR.mkdir(exist_ok=True)
DOWNLOAD_DIR.mkdir(exist_ok=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Pydantic models
class HostCreate(BaseModel):
    name: str
    ip_address: str
    port: int = 22
    user: str
    private_key_path: Optional[str] = None
    strict_host_checking: bool = False
    tags: List[str] = []


class HostUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    user: Optional[str] = None
    private_key_path: Optional[str] = None
    strict_host_checking: Optional[bool] = None
    tags: Optional[List[str]] = None


class CommandRequest(BaseModel):
    host_ids: List[int]
    command: str
    timeout: int = 30


class PlaybookCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    commands: List[str]
    host_ids: List[int]


class PlaybookExecute(BaseModel):
    playbook_id: int


# Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load SSH keys from config on startup
    config_path = BASE_DIR / "config.yaml"
    if config_path.exists():
        try:
            with open(config_path) as f:
                config = yaml.safe_load(f)
            
            key_val = config.get("private_key_file", "") or os.getenv("DEFAULT_SSH_KEY", "")
            default_key = os.path.expanduser(key_val) if key_val else ""
            default_user = config.get("ssh_user", "root") or os.getenv("DEFAULT_SSH_USER", "root")
            
            if default_key and os.path.exists(default_key):
                # Auto-connect hosts from config
                for host_entry in config.get("hosts", []):
                    if ":" in host_entry:
                        ip, port = host_entry.rsplit(":", 1)
                        port = int(port)
                    else:
                        ip, port = host_entry, 22
                    
                    host = Host(
                        name=ip,
                        ip_address=ip,
                        port=port,
                        user=default_user,
                        private_key_path=default_key,
                        strict_host_checking=config.get("strict_host_key_checking", "no") == "yes"
                    )
                    db = SessionLocal()
                    try:
                        if not db.query(Host).filter(Host.ip_address == ip).first():
                            db.add(host)
                            db.commit()
                            db.refresh(host)
                            logger.info(f"Added host from config: {ip}")
                    finally:
                        db.close()
        except Exception as e:
            logger.error(f"Error loading config: {e}")
    
    yield
    
    # Cleanup on shutdown
    pool.disconnect_all()


# App
app = FastAPI(title="Neutron v10 Web", version="10.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ HOSTS API ============

@app.get("/api/hosts")
def get_hosts(db: Session = Depends(get_db)):
    hosts = db.query(Host).all()
    result = []
    for h in hosts:
        conn = pool.get_connection(h.id)
        result.append({
            "id": h.id,
            "name": h.name,
            "ip_address": h.ip_address,
            "port": h.port,
            "user": h.user,
            "tags": h.tags,
            "is_connected": conn.is_connected if conn else False,
            "created_at": h.created_at.isoformat()
        })
    return result


@app.post("/api/hosts")
def create_host(host_data: HostCreate, db: Session = Depends(get_db)):
    host = Host(
        name=host_data.name,
        ip_address=host_data.ip_address,
        port=host_data.port,
        user=host_data.user,
        private_key_path=host_data.private_key_path or os.getenv("DEFAULT_SSH_KEY", os.path.expanduser("~/.ssh/neutron.key")),
        strict_host_checking=host_data.strict_host_checking,
        tags=host_data.tags
    )
    db.add(host)
    db.commit()
    db.refresh(host)
    return {"id": host.id, "message": "Host created"}


@app.put("/api/hosts/{host_id}")
def update_host(host_id: int, host_data: HostUpdate, db: Session = Depends(get_db)):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(404, "Host not found")
    
    for key, value in host_data.model_dump(exclude_unset=True).items():
        setattr(host, key, value)
    
    db.commit()
    return {"message": "Host updated"}


@app.delete("/api/hosts/{host_id}")
def delete_host(host_id: int, db: Session = Depends(get_db)):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(404, "Host not found")
    
    pool.disconnect(host_id)
    db.delete(host)
    db.commit()
    return {"message": "Host deleted"}


@app.post("/api/hosts/{host_id}/connect")
def connect_host(host_id: int, db: Session = Depends(get_db)):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(404, "Host not found")
    
    conn = SSHConnection(
        host_id=host.id,
        name=host.name,
        ip_address=host.ip_address,
        port=host.port,
        user=host.user,
        private_key_path=host.private_key_path
    )
    
    success, message = pool.connect(conn, host.strict_host_checking)
    
    host_entry = db.query(Host).filter(Host.id == host_id).first()
    if host_entry:
        host_entry.private_key_path = conn.private_key_path
        db.commit()
    
    return {"connected": success, "message": message}


@app.post("/api/hosts/{host_id}/disconnect")
def disconnect_host(host_id: int):
    pool.disconnect(host_id)
    return {"message": "Disconnected"}


@app.post("/api/hosts/connect-all")
def connect_all_hosts(db: Session = Depends(get_db)):
    hosts = db.query(Host).all()
    results = {}
    
    for host in hosts:
        conn = SSHConnection(
            host_id=host.id,
            name=host.name,
            ip_address=host.ip_address,
            port=host.port,
            user=host.user,
            private_key_path=host.private_key_path
        )
        success, message = pool.connect(conn, host.strict_host_checking)
        results[host.id] = {"name": host.name, "connected": success, "message": message}
    
    return results


# ============ COMMANDS API ============

@app.post("/api/commands/execute")
async def execute_command(cmd: CommandRequest, db: Session = Depends(get_db)):
    results = await execute_command_parallel(cmd.host_ids, cmd.command, cmd.timeout)
    
    # Save to history
    for host_id, result in results.items():
        history = CommandHistory(
            host_id=host_id,
            command=cmd.command,
            output=result["output"][:10000],  # Limit output size
            error=result["error"][:1000],
            exit_code=result["exit_code"],
            status=result["status"]
        )
        db.add(history)
    
    db.commit()
    return results


# ============ FILE TRANSFER API ============

@app.post("/api/files/push")
async def push_file(
    host_ids: List[int] = Form(...),
    remote_path: str = Form(...),
    file: UploadFile = File(...)
):
    # Save uploaded file temporarily
    temp_path = UPLOAD_DIR / file.filename
    try:
        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        results = await upload_file_parallel(host_ids, str(temp_path), remote_path)
    finally:
        # Cleanup temp file
        try:
            os.remove(temp_path)
        except OSError:
            pass
    
    return results


@app.post("/api/files/pull")
async def pull_file(
    background_tasks: BackgroundTasks,
    host_ids: str = Query(...),
    remote_path: str = Query(...),
    db: Session = Depends(get_db)
):
    # Parse comma-separated host_ids from query parameter
    host_id_list = [int(hid.strip()) for hid in host_ids.split(',')]
    
    host_names = {}
    for hid in host_id_list:
        host = db.query(Host).filter(Host.id == hid).first()
        if host:
            host_names[hid] = host.name
    
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    target_dir = DOWNLOAD_DIR / timestamp
    target_dir.mkdir(exist_ok=True)
    
    results = await download_file_parallel(host_id_list, remote_path, str(target_dir), host_names)
    
    # Create zip file
    zip_path = str(target_dir) + ".zip"
    shutil.make_archive(str(target_dir), 'zip', str(target_dir))
    
    # Cleanup task
    def cleanup():
        try:
            shutil.rmtree(target_dir)
            if os.path.exists(zip_path):
                os.remove(zip_path)
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
            
    background_tasks.add_task(cleanup)
    
    # Send custom header so frontend knows if there were errors inside the zip.
    # We could just return the file directly.
    filename = f"neutron_pull_{timestamp}.zip"
    return FileResponse(
        zip_path, 
        filename=filename, 
        media_type="application/zip",
        headers={"X-Pull-Results": json.dumps({k: v.get('success', False) for k, v in results.items()})}
    )


# ============ PLAYBOOKS API ============

@app.get("/api/playbooks")
def get_playbooks(db: Session = Depends(get_db)):
    playbooks = db.query(Playbook).all()
    return [
        {
            "id": pb.id,
            "name": pb.name,
            "description": pb.description,
            "commands": pb.commands,
            "host_ids": pb.host_ids,
            "created_at": pb.created_at.isoformat() if pb.created_at else None,
            "updated_at": pb.updated_at.isoformat() if pb.updated_at else None
        }
        for pb in playbooks
    ]


@app.post("/api/playbooks")
def create_playbook(playbook: PlaybookCreate, db: Session = Depends(get_db)):
    pb = Playbook(
        name=playbook.name,
        description=playbook.description,
        commands=playbook.commands,
        host_ids=playbook.host_ids
    )
    db.add(pb)
    db.commit()
    db.refresh(pb)
    return {"id": pb.id, "message": "Playbook created"}


@app.delete("/api/playbooks/{playbook_id}")
def delete_playbook(playbook_id: int, db: Session = Depends(get_db)):
    pb = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not pb:
        raise HTTPException(404, "Playbook not found")
    db.delete(pb)
    db.commit()
    return {"message": "Playbook deleted"}


@app.post("/api/playbooks/execute")
async def execute_playbook(playbook: PlaybookExecute, db: Session = Depends(get_db)):
    pb = db.query(Playbook).filter(Playbook.id == playbook.playbook_id).first()
    if not pb:
        raise HTTPException(404, "Playbook not found")
    
    results = await run_playbook(pb.host_ids, pb.commands)
    return results


# ============ HISTORY API ============

@app.get("/api/history")
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    history = db.query(CommandHistory).order_by(
        CommandHistory.executed_at.desc()
    ).limit(limit).all()
    
    return [
        {
            "id": h.id,
            "host_id": h.host_id,
            "command": h.command,
            "output": h.output,
            "exit_code": h.exit_code,
            "status": h.status,
            "executed_at": h.executed_at.isoformat()
        }
        for h in history
    ]


# ============ WEBSOCKET FOR REAL-TIME TERMINAL ============

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}

    async def connect(self, websocket: WebSocket, host_id: int):
        await websocket.accept()
        self.active_connections[f"{host_id}_{id(websocket)}"] = {
            "websocket": websocket,
            "host_id": host_id
        }

    def disconnect(self, websocket: WebSocket, host_id: int):
        key = f"{host_id}_{id(websocket)}"
        if key in self.active_connections:
            del self.active_connections[key]


manager = ConnectionManager()


@app.websocket("/ws/terminal/{host_id}")
async def terminal_websocket(websocket: WebSocket, host_id: int):
    await manager.connect(websocket, host_id)
    
    conn = pool.get_connection(host_id)
    if not conn or not conn.is_connected:
        await websocket.send_text(json.dumps({"error": "Not connected to host"}))
        manager.disconnect(websocket, host_id)
        return

    channel = None
    try:
        transport = conn.client.get_transport()
        if transport and not transport.is_active():
            conn.connect()
            transport = conn.client.get_transport()
            
        if not transport:
            await websocket.send_text(json.dumps({"error": "No transport available"}))
            manager.disconnect(websocket, host_id)
            return

        # Open interactive shell
        channel = conn.client.invoke_shell()
        channel.settimeout(1)
        
        # Send welcome
        await websocket.send_text(json.dumps({"type": "connected", "message": "Connected to host"}))
        
        async def read_from_shell():
            while True:
                try:
                    if channel.recv_ready():
                        data = channel.recv(4096).decode('utf-8', errors='replace')
                        await websocket.send_text(json.dumps({"type": "output", "data": data}))
                    await asyncio.sleep(0.05)
                except Exception:
                    break
        
        async def send_to_shell():
            try:
                while True:
                    data = await websocket.receive_text()
                    msg = json.loads(data)
                    if msg.get("type") == "input":
                        channel.send(msg["data"])
            except WebSocketDisconnect:
                pass
        
        await asyncio.gather(read_from_shell(), send_to_shell())
    
    except Exception as e:
        await websocket.send_text(json.dumps({"error": str(e)}))
    finally:
        if channel:
            try:
                channel.close()
            except Exception:
                pass
        manager.disconnect(websocket, host_id)


# ============ DASHBOARD API ============

@app.get("/api/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    hosts = db.query(Host).all()
    total_hosts = len(hosts)
    connected_hosts = [(h, pool.get_connection(h.id)) for h in hosts]
    connected = sum(1 for _, conn in connected_hosts if conn and conn.is_connected)
    
    total_commands = db.query(CommandHistory).count()
    recent_commands = db.query(CommandHistory).order_by(
        CommandHistory.executed_at.desc()
    ).limit(10).all()
    
    playbooks = db.query(Playbook).count()
    
    return {
        "total_hosts": total_hosts,
        "connected_hosts": connected,
        "total_commands": total_commands,
        "recent_commands": [
            {
                "id": c.id,
                "command": c.command,
                "status": c.status,
                "executed_at": c.executed_at.isoformat()
            }
            for c in recent_commands
        ],
        "total_playbooks": playbooks
    }


# ============ SERVE FRONTEND ============

FRONTEND_DIR = BASE_DIR / "frontend" / "dist"

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        
        file_path = FRONTEND_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        
        index_path = FRONTEND_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        
        raise HTTPException(404, "Not found")


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", 8080))
    uvicorn.run(app, host=host, port=port)
