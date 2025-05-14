#!/usr/bin/env python3
import yaml
import paramiko
import sys
import threading
import time
from queue import Queue

class SSHSession:
    def __init__(self, host, port, config):
        self.host = host
        self.port = port
        self.config = config
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.shell = None
        self.output_queue = Queue()
        self.lock = threading.Lock()

    def connect(self):
        params = {
            'hostname': self.host,
            'port': self.port,
            'username': self.config['user'],
            'timeout': self.config.get('timeout', 30)
        }
        if self.config.get('key_path'):
            params['key_filename'] = self.config['key_path']
        else:
            params['password'] = self.config['password']

        self.client.connect(**params)
        self.shell = self.client.invoke_shell()
        threading.Thread(target=self._read_output, daemon=True).start()

    def _read_output(self):
        while True:
            if self.shell.recv_ready():
                data = self.shell.recv(4096).decode(errors='ignore')
                self.output_queue.put(data)
            time.sleep(0.1)

    def send_command(self, cmd):
        if self.shell:
            self.shell.send(cmd + '\n')

    def get_output(self):
        output = ""
        while not self.output_queue.empty():
            output += self.output_queue.get()
        return output.strip()

    def close(self):
        self.client.close()


class SSHTool:
    def __init__(self):
        self.config = self.load_yaml('config.yaml').get('ssh', {})
        self.sources = self.load_yaml('sources.yaml').get('sources', [])
        self.sessions = []

    def load_yaml(self, path):
        try:
            with open(path) as f:
                return yaml.safe_load(f) or {}
        except Exception:
            sys.exit(f"Hata: {path} okunamadı.")

    def setup_sessions(self):
        if not self.sources:
            sys.exit("Hata: Sunucu listesi boş.")

        for s in self.sources:
            host, port = (s, self.config.get('port', 22)) if isinstance(s, str) else (s['host'], s.get('port', self.config.get('port', 22)))
            session = SSHSession(host, port, self.config)
            try:
                session.connect()
                self.sessions.append(session)
            except Exception as e:
                print(f"{host}:{port} bağlantı hatası: {e}")

    def interactive_mode(self):
        print("SSH Aracı (kalıcı oturum): Komut girin veya 'exit' ile çıkın.")
        while True:
            cmd = input("ssh> ").strip()
            if cmd.lower() == 'exit':
                break
            if not cmd:
                continue

            for session in self.sessions:
                session.send_command(cmd)

            time.sleep(1)  # çıktıların dolması için küçük bekleme
            for session in self.sessions:
                print(f"\n{session.host}:{session.port} > {cmd}")
                output = session.get_output()
                print(output if output else "(çıktı yok)")

    def close_all(self):
        for s in self.sessions:
            s.close()


if __name__ == "__main__":
    tool = SSHTool()
    tool.setup_sessions()
    try:
        tool.interactive_mode()
    finally:
        tool.close_all()
