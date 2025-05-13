#!/usr/bin/env python3
import yaml
import paramiko
import colorama
import os
import sys
from typing import List, Dict


class LinuxSSHTool:
    def __init__(self):
        # Initialize colorama
        colorama.init(autoreset=True)
        self.config = self.load_config()
        self.servers = self.load_servers()

    def load_config(self) -> Dict:
        """Load SSH configuration from config.cfg."""
        try:
            with open('config.cfg') as f:
                config = yaml.safe_load(f)

            ssh_config = config.get('ssh')
            if not ssh_config or not ssh_config.get('user'):
                raise ValueError("Invalid config.cfg: SSH user is not defined.")

            # Prevent using both key_path and password
            if ssh_config.get('key_path') and ssh_config.get('password'):
                raise ValueError("Please provide either a key_path or password, not both.")

            return ssh_config

        except Exception as e:
            print(f"{colorama.Fore.RED}[ERROR] Failed to load config: {e}{colorama.Style.RESET_ALL}")
            sys.exit(1)

    def load_servers(self) -> List[Dict]:
        """Load the list of servers from source.yaml."""
        try:
            with open('source.yaml') as f:
                servers = yaml.safe_load(f).get('servers', [])

            normalized = []
            for s in servers:
                if isinstance(s, str):
                    normalized.append({'host': s, 'port': self.config.get('port', 22)})
                else:
                    s['port'] = s.get('port', self.config.get('port', 22))
                    normalized.append(s)
            return normalized

        except Exception as e:
            print(f"{colorama.Fore.RED}[ERROR] Failed to load server list: {e}{colorama.Style.RESET_ALL}")
            sys.exit(1)

    def run_command(self, host: str, port: int, command: str):
        """Establish SSH connection and run a command on a remote host."""
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            print(f"\n{colorama.Fore.BLUE}🔹 Connecting to {host}:{port}{colorama.Style.RESET_ALL}")
            print(f"{colorama.Fore.CYAN}   $ {command}{colorama.Style.RESET_ALL}")

            connect_params = {
                'hostname': host,
                'port': port,
                'username': self.config['user'],
            }

            # Use key or password for authentication
            if self.config.get('key_path'):
                connect_params['key_filename'] = os.path.expanduser(self.config['key_path'])
            elif self.config.get('password'):
                connect_params['password'] = self.config['password']

            ssh.connect(**connect_params)

            stdin, stdout, stderr = ssh.exec_command(command)
            output = stdout.read().decode().strip()
            error = stderr.read().decode().strip()

            if output:
                print(f"{colorama.Fore.GREEN}   ✅ Output:{colorama.Style.RESET_ALL}\n{output}")
            if error:
                print(f"{colorama.Fore.RED}   ❗ Error:{colorama.Style.RESET_ALL}\n{error}")
            if not output and not error:
                print(f"{colorama.Fore.YELLOW}   ⚠️  No output returned.{colorama.Style.RESET_ALL}")

        except Exception as e:
            print(f"{colorama.Fore.RED}   ❌ Connection error: {str(e)}{colorama.Style.RESET_ALL}")
        finally:
            ssh.close()

    def execute_task(self, task_file: str):
        """Execute a list of commands from a YAML file on all servers."""
        try:
            with open(task_file) as f:
                commands = yaml.safe_load(f).get('commands', [])

            for server in self.servers:
                for cmd in commands:
                    self.run_command(server['host'], server['port'], cmd)

        except Exception as e:
            print(f"{colorama.Fore.RED}[ERROR] Task execution failed: {e}{colorama.Style.RESET_ALL}")

    def interactive_mode(self):
        """Start interactive mode for manual SSH command input."""
        print(f"{colorama.Fore.MAGENTA}#######################################################################")
        print(f"{colorama.Fore.MAGENTA}###                            NEUTRON                              ###")
        print(f"{colorama.Fore.MAGENTA}### 🐧Lightweight automation tool for Linux (Type 'exit' to quit)   ###")
        print(f"{colorama.Fore.MAGENTA}###                     www.farukguler.com                          ###")
        print(f"{colorama.Fore.MAGENTA}#######################################################################")
        while True:
            try:
                cmd = input(f"\n{colorama.Fore.GREEN}ssh>{colorama.Style.RESET_ALL} ").strip()
                if cmd.lower() in ['exit', 'quit']:
                    break

                for server in self.servers:
                    self.run_command(server['host'], server['port'], cmd)

            except KeyboardInterrupt:
                print(f"\n{colorama.Fore.YELLOW}Exiting...{colorama.Style.RESET_ALL}")
                break


if __name__ == "__main__":
    tool = LinuxSSHTool()

    if len(sys.argv) > 1:
        tool.execute_task(sys.argv[1])
    else:
        tool.interactive_mode()
