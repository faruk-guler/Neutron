#!/usr/bin/env python3
import yaml
import paramiko
import os
import sys
from typing import List, Dict


class LinuxSSHTool:
    def __init__(self):
        self.config = self.load_config()
        self.servers = self.load_servers()

    def load_config(self) -> Dict:
        try:
            with open('config.yaml') as f:
                config = yaml.safe_load(f)

            if not config.get('ssh') or not config['ssh'].get('user'):
                raise ValueError("Invalid config.yaml: SSH user not defined")

            return config['ssh']
        except Exception as e:
            print(f"[ERROR] Config loading failed: {e}")
            sys.exit(1)

    def load_servers(self) -> List[Dict]:
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
            print(f"[ERROR] Server list loading failed: {e}")
            sys.exit(1)

    def run_command(self, host: str, port: int, command: str):
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            print(f"\n🔹 {host}:{port}")
            print(f"   $ {command}")

            # Bağlantı parametrelerini hazırla
            connect_params = {
                'hostname': host,
                'port': port,
                'username': self.config['user'],
                'timeout': self.config.get('timeout', 10)
            }

            # Eğer key_path varsa bağlantı parametrelerine ekle
            if self.config.get('key_path'):
                connect_params['key_filename'] = os.path.expanduser(self.config['key_path'])
            # Eğer password varsa bağlantı parametrelerine ekle
            elif self.config.get('password'):
                connect_params['password'] = self.config['password']

            ssh.connect(**connect_params)

            stdin, stdout, stderr = ssh.exec_command(command)
            output = stdout.read().decode().strip()
            error = stderr.read().decode().strip()

            if output:
                print(f"   ✅ Output:\n{output}")
            if error:
                print(f"   ❗ Error:\n{error}")

        except Exception as e:
            print(f"   ❌ Connection error: {str(e)}")
        finally:
            ssh.close()

    def execute_task(self, task_file: str):
        try:
            with open(task_file) as f:
                commands = yaml.safe_load(f).get('commands', [])

            for server in self.servers:
                for cmd in commands:
                    self.run_command(server['host'], server['port'], cmd)

        except Exception as e:
            print(f"[ERROR] Task execution failed: {e}")

    def interactive_mode(self):
        print("🐧 Linux SSH Manager (Type 'exit' to quit)")
        while True:
            try:
                cmd = input("\nssh> ").strip()
                if cmd.lower() in ['exit', 'quit']:
                    break

                for server in self.servers:
                    self.run_command(server['host'], server['port'], cmd)

            except KeyboardInterrupt:
                print("\nExiting...")
                break


if __name__ == "__main__":
    tool = LinuxSSHTool()

    if len(sys.argv) > 1:
        tool.execute_task(sys.argv[1])
    else:
        tool.interactive_mode()
