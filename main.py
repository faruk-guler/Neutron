import yaml, paramiko, threading

def load_yaml(path):
    with open(path) as f: return yaml.safe_load(f)

def run_ssh(host, port, user, password, cmd, current_dirs):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, port, user, password, timeout=15)
        
        key = f"{host}:{port}"
        if cmd.startswith("cd "):
            # Dizin değiştirme komutuysa, dizini güncelle
            cd_path = cmd.split(' ', 1)[1].strip()
            
            if cd_path.startswith('/'):
                # Mutlak yol
                current_dirs[key] = f"cd {cd_path}"
            else:
                # Göreceli yol
                current_dirs[key] = f"{current_dirs.get(key, 'cd ~')} && cd {cd_path}"
            
            return None  # cd komutları için çıktı gösterme
        else:
            # Normal komut çalıştır
            current_dir_cmd = current_dirs.get(key, "")
            full_cmd = f"{current_dir_cmd} && {cmd}" if current_dir_cmd else cmd
            stdin, stdout, stderr = ssh.exec_command(full_cmd)
            out = stdout.read().decode().strip() or stderr.read().decode().strip() or "(çıktı yok)"
            ssh.close()
            return (host, port, out)
    except Exception as e:
        return (host, port, "bağlantı hatası")

config = load_yaml('config.yaml')['ssh']
sources = load_yaml('sources.yaml')['sources']
current_dirs = {}  # Her host için ayrı dizin takibi

while True:
    cmd = input("shell # ")
    if cmd.lower() == "exit": break
    if not cmd: continue
    
    results = []
    threads = []
    
    for s in sources:
        host = s['host'] if isinstance(s, dict) else s
        port = s.get('port', config['port']) if isinstance(s, dict) else config['port']
        
        def run_cmd(h, p, u, pwd, c, dirs):
            result = run_ssh(h, p, u, pwd, c, dirs)
            if result:  # None değilse (cd komutları için None dönüyor)
                results.append(result)
        
        t = threading.Thread(target=run_cmd, 
                            args=(host, port, config['user'], config['password'], cmd, current_dirs))
        threads.append(t)
        t.start()
    
    for t in threads:
        t.join()
    
    # Sonuçları istenen formatta göster
    for host, port, output in results:
        print("-" * 36)
        print(f"{host}:{port} >>>>")
        print(output)
