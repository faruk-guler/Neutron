import yaml
import paramiko
import threading

def load_yaml(path):
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def run_ssh(host, port, user, password, cmd, current_dirs):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, port=port, username=user, password=password, timeout=15)
        
        key = f"{host}:{port}"
        
        if cmd.startswith("cd "):
            cd_path = cmd.split(' ', 1)[1].strip()
            # Dizini güncelle
            if cd_path.startswith('/'):
                current_dirs[key] = f"cd {cd_path}"
            else:
                current_dirs[key] = f"{current_dirs.get(key, 'cd ~')} && cd {cd_path}"
            return None
        
        full_cmd = f"{current_dirs.get(key, '')} && {cmd}" if current_dirs.get(key) else cmd
        
        stdin, stdout, stderr = ssh.exec_command(full_cmd)
        output = stdout.read().decode().strip() or stderr.read().decode().strip() or "(çıktı yok)"
        ssh.close()
        
        return (host, port, output)
    except Exception as e:
        return (host, port, f"Bağlantı hatası: {e}")

def main():
    config = load_yaml('config.yaml').get('ssh', {})
    sources = load_yaml('sources.yaml').get('sources', [])
    current_dirs = {}
    
    while True:
        cmd = input("shell # ").strip()
        if cmd.lower() == "exit":
            break
        if not cmd:
            continue
        
        results = []
        threads = []
        
        def worker(host, port):
            res = run_ssh(host, port, config.get('user'), config.get('password'), cmd, current_dirs)
            if res:
                results.append(res)
        
        for source in sources:
            if isinstance(source, dict):
                host = source.get('host')
                port = source.get('port', config.get('port', 22))
            else:
                host = source
                port = config.get('port', 22)
            
            t = threading.Thread(target=worker, args=(host, port))
            threads.append(t)
            t.start()
        
        for t in threads:
            t.join()
        
        for host, port, output in results:
            print("-" * 36)
            print(f"{host}:{port}")
            print(">>>>>>>>>>>>>>>>>\n".rstrip())  # Boş satır yok
            print(output)

if __name__ == "__main__":
    main()
