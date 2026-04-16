"""Command Executor with parallel execution support"""
import asyncio
import logging
import os
from typing import List, Dict, Any
from ssh_manager import pool, SSHConnection

logger = logging.getLogger(__name__)


async def execute_command_parallel(
    host_ids: List[int],
    command: str,
    timeout: int = 30
) -> Dict[int, Dict[str, Any]]:
    """Execute command on multiple hosts in parallel"""
    results = {}

    async def exec_single(host_id: int):
        conn = pool.get_connection(host_id)
        if not conn or not conn.is_connected:
            results[host_id] = {
                "exit_code": -1,
                "output": "",
                "error": "Not connected",
                "status": "failed"
            }
            return

        loop = asyncio.get_running_loop()
        exit_code, output, error = await loop.run_in_executor(
            None, conn.execute_command, command, timeout
        )

        results[host_id] = {
            "exit_code": exit_code,
            "output": output,
            "error": error,
            "status": "success" if exit_code == 0 else "failed"
        }

    tasks = [exec_single(hid) for hid in host_ids]
    await asyncio.gather(*tasks)

    return results


async def execute_command_single(
    host_id: int,
    command: str,
    timeout: int = 30
) -> Dict[str, Any]:
    """Execute command on single host"""
    conn = pool.get_connection(host_id)
    if not conn or not conn.is_connected:
        return {
            "exit_code": -1,
            "output": "",
            "error": "Not connected",
            "status": "failed"
        }

    loop = asyncio.get_running_loop()
    exit_code, output, error = await loop.run_in_executor(
        None, conn.execute_command, command, timeout
    )

    return {
        "exit_code": exit_code,
        "output": output,
        "error": error,
        "status": "success" if exit_code == 0 else "failed"
    }


async def upload_file_parallel(
    host_ids: List[int],
    local_path: str,
    remote_path: str
) -> Dict[int, Dict[str, Any]]:
    """Upload file to multiple hosts in parallel"""
    results = {}

    async def upload_single(host_id: int):
        conn = pool.get_connection(host_id)
        if not conn or not conn.is_connected:
            results[host_id] = {"success": False, "error": "Not connected"}
            return

        loop = asyncio.get_running_loop()
        success, message = await loop.run_in_executor(
            None, conn.upload_file, local_path, remote_path
        )

        results[host_id] = {"success": success, "message": message}

    tasks = [upload_single(hid) for hid in host_ids]
    await asyncio.gather(*tasks)

    return results


async def download_file_parallel(
    host_ids: List[int],
    remote_path: str,
    local_dir: str,
    host_names: Dict[int, str]
) -> Dict[int, Dict[str, Any]]:
    """Download file from multiple hosts in parallel"""
    results = {}

    async def download_single(host_id: int):
        conn = pool.get_connection(host_id)
        if not conn or not conn.is_connected:
            results[host_id] = {"success": False, "error": "Not connected"}
            return

        # Create host-specific directory
        host_dir = os.path.join(local_dir, host_names.get(host_id, str(host_id)))
        os.makedirs(host_dir, exist_ok=True)
        local_path = os.path.join(host_dir, os.path.basename(remote_path))

        loop = asyncio.get_running_loop()
        success, message = await loop.run_in_executor(
            None, conn.download_file, remote_path, local_path
        )

        results[host_id] = {"success": success, "message": message, "local_path": local_path}

    tasks = [download_single(hid) for hid in host_ids]
    await asyncio.gather(*tasks)

    return results


async def run_playbook(
    host_ids: List[int],
    commands: List[str],
    progress_callback=None
) -> Dict[int, List[Dict[str, Any]]]:
    """Run a playbook (sequence of commands) on multiple hosts"""
    results = {hid: [] for hid in host_ids}

    for i, command in enumerate(commands):
        cmd_results = await execute_command_parallel(host_ids, command)

        for host_id, result in cmd_results.items():
            results[host_id].append({
                "command": command,
                "step": i + 1,
                **result
            })

        if progress_callback:
            await progress_callback(i + 1, len(commands), cmd_results)

    return results
