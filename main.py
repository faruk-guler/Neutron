import paramiko
import winrm
import yaml
import logging
from typing import Dict, List

# Loglama ayarları
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class CommandRunner:
    def __init__(self, config_file: str, inventory_file: str, ssh_commands_file: str, winrm_commands_file: str):
        self.config = self.load_yaml(config_file)
        self.inventory = self.load_yaml(inventory_file)
        self.ssh_commands = self.load_yaml(ssh_commands_file)
        self.winrm_commands = self.load_yaml(winrm_commands_file)
        self.ssh_clients = {}
        self.winrm_sessions = {}

    def load_yaml(self, file_path: str) -> Dict:
        """YAML dosyasını oku."""
        try:
            with open(file_path, 'r') as f:
                return yaml.safe_load(f)
        except Exception as e:
            logger.error(f"Failed to load {file_path}: {e}")
            raise

    def connect_ssh(self, host: str) -> paramiko.SSHClient:
        """SSH bağlantısı kur."""
        if host not in self.ssh_clients:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            ssh_config = self.config["ssh"]
            try:
                client.connect(
                    host,
                    username=ssh_config["user"],
                    key_filename=ssh_config["key_path"],
                    port=ssh_config.get("port", 22)
                )
                self.ssh_clients[host] = client
                logger.info(f"SSH connection established to {host}")
            except Exception as e:
                logger.error(f"Failed to connect to {host} via SSH: {e}")
                raise
        return self.ssh_clients[host]

    def connect_winrm(self, host: str) -> winrm.Session:
        """WinRM bağlantısı kur."""
        if host not in self.winrm_sessions:
            winrm_config = self.config["winrm"]
            try:
                session = winrm.Session(
                    f"http://{host}:{winrm_config['port']}/wsman",
                    auth=(winrm_config["user"], winrm_config["password"]),
                    transport='ntlm'
                )
                self.winrm_sessions[host] = session
                logger.info(f"WinRM connection established to {host}")
            except Exception as e:
                logger.error(f"Failed to connect to {host} via WinRM: {e}")
                raise
        return self.winrm_sessions[host]

    def execute_command(self, host: str, command: Dict, connection_type: str) -> Dict:
        """Komut çalıştır."""
        cmd = command["command"]
        cmd_name = command["name"]

        if connection_type == "ssh":
            client = self.connect_ssh(host)
            stdin, stdout, stderr = client.exec_command(cmd)
            output = stdout.read().decode()
            error = stderr.read().decode()
            if error:
                logger.error(f"Error on {host} for {cmd_name}: {error}")
                return {"status": "failed", "host": host, "command": cmd_name, "output": error}
            logger.info(f"Command {cmd_name} executed on {host}")
            return {"status": "success", "host": host, "command": cmd_name, "output": output}

        elif connection_type == "winrm":
            session = self.connect_winrm(host)
            result = session.run_ps(cmd)
            if result.status_code != 0:
                logger.error(f"Error on {host} for {cmd_name}: {result.std_err.decode()}")
                return {"status": "failed", "host": host, "command": cmd_name, "output": result.std_err.decode()}
            logger.info(f"Command {cmd_name} executed on {host}")
            return {"status": "success", "host": host, "command": cmd_name, "output": result.std_out.decode()}

        else:
            logger.error(f"Unknown connection type {connection_type} for {host}")
            return {"status": "failed", "host": host, "command": cmd_name, "output": f"Unknown connection type {connection_type}"}

    def run_commands(self) -> List[Dict]:
        """Tüm sunucularda uygun komutları çalıştır."""
        results = []
        for server in self.inventory["servers"]:
            host = server["host"]
            connection_type = server["type"]
            commands = self.ssh_commands["commands"] if connection_type == "ssh" else self.winrm_commands["commands"]
            
            for command in commands:
                result = self.execute_command(host, command, connection_type)
                results.append(result)
                
        return results

    def print_results(self, results: List[Dict]):
        """Sonuçları yazdır."""
        print("\n=== Command Execution Results ===")
        for result in results:
            status = result["status"].upper()
            host = result["host"]
            cmd = result["command"]
            output = result["output"]
            print(f"[{status}] {host} - {cmd}")
            print(f"Output:\n{output}\n{'-'*40}")

    def __del__(self):
        """Bağlantıları kapat."""
        for client in self.ssh_clients.values():
            client.close()
        self.winrm_sessions.clear()

if __name__ == "__main__":
    try:
        runner = CommandRunner("config.yaml", "source.yaml", "task_ssh.yaml", "task_winrm.yaml")
        results = runner.run_commands()
        runner.print_results(results)
    except Exception as e:
        logger.error(f"Script failed: {e}")
