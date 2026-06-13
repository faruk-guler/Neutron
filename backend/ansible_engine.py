import yaml
import logging
from typing import List, Dict, Any
from ssh_manager import pool

logger = logging.getLogger(__name__)

class AnsibleEngine:
    def __init__(self, host_ids: List[int]):
        self.host_ids = host_ids

    def run_playbook_yaml(self, yaml_content: str) -> Dict[int, Dict[str, Any]]:
        """Parses and executes a list of declarative tasks from YAML"""
        try:
            playbook = yaml.safe_load(yaml_content)
        except Exception as e:
            raise ValueError(f"Invalid YAML syntax: {str(e)}")

        if not isinstance(playbook, list):
            raise ValueError("Playbook must be a list of plays/tasks")

        # Normalize playbook structure (it might be a list of tasks or list of plays)
        tasks = []
        for item in playbook:
            if isinstance(item, dict) and "tasks" in item:
                tasks.extend(item["tasks"])
            else:
                tasks.append(item)

        results = {hid: {"success": True, "changed_count": 0, "tasks": []} for hid in self.host_ids}

        for task in tasks:
            task_name = task.get("name", "Unnamed Task")
            
            # Find the active module in the task
            module_name = None
            module_args = None
            for key in ["apt", "service", "file", "shell"]:
                if key in task:
                    module_name = key
                    module_args = task[key]
                    break

            if not module_name:
                for hid in self.host_ids:
                    results[hid]["tasks"].append({
                        "name": task_name,
                        "status": "failed",
                        "changed": False,
                        "error": "No supported module found in task definition"
                    })
                    results[hid]["success"] = False
                continue

            for hid in self.host_ids:
                # If host already failed previous tasks, skip it or continue? We continue but mark status
                if not results[hid]["success"]:
                    results[hid]["tasks"].append({
                        "name": task_name,
                        "status": "skipped",
                        "changed": False,
                        "error": "Skipped due to previous task failure"
                    })
                    continue

                conn = pool.get_connection(hid)
                if not conn or not conn.is_connected:
                    results[hid]["tasks"].append({
                        "name": task_name,
                        "status": "failed",
                        "changed": False,
                        "error": "Host not connected"
                    })
                    results[hid]["success"] = False
                    continue

                # Execute task on host
                success, changed, error = self._execute_module(conn, module_name, module_args)
                
                status_str = "changed" if changed else ("ok" if success else "failed")
                if not success:
                    results[hid]["success"] = False

                if changed:
                    results[hid]["changed_count"] += 1

                results[hid]["tasks"].append({
                    "name": task_name,
                    "status": status_str,
                    "changed": changed,
                    "error": error
                })

        return results

    def _execute_module(self, conn, module_name: str, args: Any) -> tuple[bool, bool, str]:
        """Runs the module check & execute logic on target host to maintain idempotence"""
        try:
            if module_name == "apt":
                return self._run_apt(conn, args)
            elif module_name == "service":
                return self._run_service(conn, args)
            elif module_name == "file":
                return self._run_file(conn, args)
            elif module_name == "shell":
                return self._run_shell(conn, args)
        except Exception as e:
            return False, False, f"Internal engine error: {str(e)}"
        return False, False, "Unknown module"

    def _run_apt(self, conn, args: Any) -> tuple[bool, bool, str]:
        if isinstance(args, str):
            name = args
            state = "present"
        elif isinstance(args, dict):
            name = args.get("name")
            state = args.get("state", "present")
        else:
            return False, False, "Invalid apt module arguments"

        if not name:
            return False, False, "Package name is required"

        # Check if package is installed (DPKG query)
        exit_code, stdout, stderr = conn.execute_command(f"dpkg -s {name}")
        is_installed = (exit_code == 0)

        if state == "present":
            if is_installed:
                return True, False, ""  # Idempotent: Already installed, no change
            # Install package
            # We use non-interactive mode and auto accept
            logger.info(f"Installing package {name} on {conn.name}")
            exit_code, stdout, stderr = conn.execute_command(
                f"export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get install -y {name}"
            )
            if exit_code == 0:
                return True, True, ""
            return False, False, f"Install failed: {stderr or stdout}"

        elif state == "absent":
            if not is_installed:
                return True, False, ""  # Idempotent: Already absent, no change
            # Remove package
            logger.info(f"Removing package {name} on {conn.name}")
            exit_code, stdout, stderr = conn.execute_command(
                f"export DEBIAN_FRONTEND=noninteractive && apt-get remove -y {name}"
            )
            if exit_code == 0:
                return True, True, ""
            return False, False, f"Removal failed: {stderr or stdout}"

        return False, False, f"Unsupported state: {state}"

    def _run_service(self, conn, args: Any) -> tuple[bool, bool, str]:
        if not isinstance(args, dict):
            return False, False, "Invalid service module arguments"

        name = args.get("name")
        state = args.get("state")

        if not name or not state:
            return False, False, "Service name and state are required"

        # Check active status of systemd service
        exit_code, stdout, stderr = conn.execute_command(f"systemctl is-active {name}")
        is_active = (stdout.strip() == "active")

        if state == "started":
            if is_active:
                return True, False, ""  # Idempotent: service is already started
            # Start service
            exit_code, stdout, stderr = conn.execute_command(f"systemctl start {name}")
            if exit_code == 0:
                return True, True, ""
            return False, False, f"Failed to start service: {stderr or stdout}"

        elif state == "stopped":
            if not is_active:
                return True, False, ""  # Idempotent: service is already stopped
            # Stop service
            exit_code, stdout, stderr = conn.execute_command(f"systemctl stop {name}")
            if exit_code == 0:
                return True, True, ""
            return False, False, f"Failed to stop service: {stderr or stdout}"

        elif state == "restarted":
            # Restart is always a change (non-idempotent by nature)
            exit_code, stdout, stderr = conn.execute_command(f"systemctl restart {name}")
            if exit_code == 0:
                return True, True, ""
            return False, False, f"Failed to restart service: {stderr or stdout}"

        return False, False, f"Unsupported service state: {state}"

    def _run_file(self, conn, args: Any) -> tuple[bool, bool, str]:
        if not isinstance(args, dict):
            return False, False, "Invalid file module arguments"

        path = args.get("path")
        state = args.get("state", "file")  # directory, file, absent
        mode = args.get("mode")            # e.g., 0755, 0644

        if not path:
            return False, False, "Path is required"

        # Check if path exists and what type it is
        # We can use test -e, test -d, test -f
        exit_code, stdout, stderr = conn.execute_command(f"test -e {path}")
        exists = (exit_code == 0)

        if state == "absent":
            if not exists:
                return True, False, ""
            exit_code, stdout, stderr = conn.execute_command(f"rm -rf {path}")
            if exit_code == 0:
                return True, True, ""
            return False, False, f"Failed to remove file: {stderr or stdout}"

        elif state == "directory":
            changed = False
            if not exists:
                exit_code, stdout, stderr = conn.execute_command(f"mkdir -p {path}")
                if exit_code != 0:
                    return False, False, f"Failed to create directory: {stderr or stdout}"
                changed = True
            
            # Apply mode/permissions if specified
            if mode:
                # We can check current permissions, but running chmod is cheap.
                # Let's run chmod if requested.
                exit_code, stdout, stderr = conn.execute_command(f"chmod {mode} {path}")
                if exit_code != 0:
                    return False, False, f"Failed to set mode {mode}: {stderr or stdout}"
                # If directory just created, changed=True. If existed but mode set, also changed=True.
                # In real Ansible it detects actual changes, let's treat mode change as changed.
                changed = True

            return True, changed, ""

        elif state == "file":
            changed = False
            if not exists:
                exit_code, stdout, stderr = conn.execute_command(f"touch {path}")
                if exit_code != 0:
                    return False, False, f"Failed to create file: {stderr or stdout}"
                changed = True
            
            if mode:
                exit_code, stdout, stderr = conn.execute_command(f"chmod {mode} {path}")
                if exit_code != 0:
                    return False, False, f"Failed to set mode {mode}: {stderr or stdout}"
                changed = True

            return True, changed, ""

        return False, False, f"Unsupported file state: {state}"

    def _run_shell(self, conn, args: Any) -> tuple[bool, bool, str]:
        if not isinstance(args, str):
            return False, False, "Invalid shell module argument (must be string command)"

        # Run command directly
        exit_code, stdout, stderr = conn.execute_command(args)
        if exit_code == 0:
            # Shell command is always reported as changed if it runs successfully
            return True, True, stdout
        return False, False, f"Exit code {exit_code}: {stderr or stdout}"
