"""SSH Connection Manager with Multiplexing"""
import paramiko
import threading
import os
import logging
from typing import Dict, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timezone


def utcnow():
    return datetime.now(timezone.utc)

logger = logging.getLogger(__name__)


@dataclass
class SSHConnection:
    host_id: int
    name: str
    ip_address: str
    port: int
    user: str
    private_key_path: str
    client: Optional[paramiko.SSHClient] = None
    is_connected: bool = False
    last_used: datetime = field(default_factory=utcnow)

    def connect(self, strict_host_checking: bool = False) -> Tuple[bool, str]:
        """Establish SSH connection"""
        try:
            self.client = paramiko.SSHClient()
            
            if strict_host_checking:
                self.client.load_system_host_keys()
                self.client.set_missing_host_key_policy(paramiko.RejectPolicy())
            else:
                self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            # Load private key
            if not self.private_key_path or not os.path.exists(self.private_key_path):
                return False, f"Private key not found: {self.private_key_path}"

            pkey = None
            for key_class in [paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey]:
                try:
                    pkey = key_class.from_private_key_file(self.private_key_path)
                    break
                except paramiko.SSHException:
                    continue

            if pkey is None:
                return False, "Failed to load private key (unsupported format or encrypted)"

            self.client.connect(
                hostname=self.ip_address,
                port=self.port,
                username=self.user,
                pkey=pkey,
                timeout=10,
                allow_agent=True,
                look_for_keys=True
            )
            
            # Prevent silent disconnections on idle connections
            transport = self.client.get_transport()
            if transport:
                transport.set_keepalive(30)
            
            self.is_connected = True
            self.last_used = utcnow()
            logger.info(f"Connected to {self.name} ({self.ip_address}:{self.port})")
            return True, "Connected successfully"

        except paramiko.AuthenticationException:
            return False, "Authentication failed"
        except paramiko.SSHException as e:
            return False, f"SSH error: {str(e)}"
        except Exception as e:
            return False, f"Connection failed: {str(e)}"

    def execute_command(self, command: str, timeout: int = 30) -> Tuple[int, str, str]:
        """Execute command on remote host"""
        if not self.is_connected or not self.client:
            return -1, "", "Not connected"

        try:
            transport = self.client.get_transport()
            if transport and not transport.is_active():
                success, msg = self.connect()
                if not success:
                    return -1, "", f"Reconnection failed: {msg}"
                transport = self.client.get_transport()

            if not transport:
                return -1, "", "No transport available"

            channel = transport.open_session()
            channel.settimeout(timeout)
            channel.exec_command(command)

            stdout = channel.makefile('rb')
            stderr = channel.makefile_stderr('rb')

            output = stdout.read().decode('utf-8', errors='replace')
            error = stderr.read().decode('utf-8', errors='replace')
            exit_code = channel.recv_exit_status()

            self.last_used = utcnow()
            return exit_code, output, error

        except Exception as e:
            logger.error(f"Command execution failed: {str(e)}")
            return -1, "", str(e)

    def upload_file(self, local_path: str, remote_path: str) -> Tuple[bool, str]:
        """Upload file via SFTP"""
        if not self.is_connected or not self.client:
            return False, "Not connected"

        try:
            sftp = self.client.open_sftp()
            sftp.put(local_path, remote_path)
            sftp.close()
            return True, "Upload successful"
        except Exception as e:
            return False, f"Upload failed: {str(e)}"

    def download_file(self, remote_path: str, local_path: str) -> Tuple[bool, str]:
        """Download file via SFTP"""
        if not self.is_connected or not self.client:
            return False, "Not connected"

        try:
            sftp = self.client.open_sftp()
            sftp.get(remote_path, local_path)
            sftp.close()
            return True, "Download successful"
        except Exception as e:
            return False, f"Download failed: {str(e)}"

    def disconnect(self):
        """Close SSH connection"""
        if self.client:
            try:
                self.client.close()
            except:
                pass
            self.is_connected = False
            logger.info(f"Disconnected from {self.name}")


class ConnectionPool:
    """Manages SSH connection pool"""

    def __init__(self):
        self._connections: Dict[int, SSHConnection] = {}
        self._lock = threading.Lock()

    def get_connection(self, host_id: int) -> Optional[SSHConnection]:
        """Get existing connection"""
        return self._connections.get(host_id)

    def connect(self, connection: SSHConnection, strict_host_checking: bool = False) -> Tuple[bool, str]:
        """Connect or reconnect"""
        with self._lock:
            # Close existing connection if any
            if host_id := connection.host_id:
                if host_id in self._connections:
                    self._connections[host_id].disconnect()
            
            success, message = connection.connect(strict_host_checking)
            if success:
                self._connections[connection.host_id] = connection
            return success, message

    def disconnect(self, host_id: int):
        """Disconnect specific host"""
        with self._lock:
            if host_id in self._connections:
                self._connections[host_id].disconnect()
                del self._connections[host_id]

    def disconnect_all(self):
        """Disconnect all hosts"""
        with self._lock:
            for conn in self._connections.values():
                conn.disconnect()
            self._connections.clear()

    def get_all_connections(self) -> Dict[int, SSHConnection]:
        """Get all connections"""
        return self._connections.copy()

    def cleanup_idle(self, timeout_seconds: int = 3600):
        """Remove idle connections"""
        now = utcnow()
        with self._lock:
            to_remove = []
            for host_id, conn in self._connections.items():
                if (now - conn.last_used).total_seconds() > timeout_seconds:
                    to_remove.append(host_id)
            
            for host_id in to_remove:
                self._connections[host_id].disconnect()
                del self._connections[host_id]


# Global connection pool
pool = ConnectionPool()
