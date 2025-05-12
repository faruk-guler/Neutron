import yaml
import paramiko
import os
import argparse
import sys

def load_yaml(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        print(f"[ERROR] Dosya bulunamadı: {path}")
        sys.exit(1)
    except yaml.YAMLError as e:
        print(f"[ERROR] YAML parse hatası {path}: {e}")
        sys.exit(1)

def validate_config(config):
    if 'ssh' not in config:
        raise ValueError("config.yaml'da 'ssh' bölümü eksik.")

    ssh = config['ssh']
    if 'user' not in ssh:
        raise ValueError("SSH kullanıcı adı eksik")
    if not ('password' in ssh or 'key_path' in ssh):
        raise ValueError("SSH şifre veya anahtar dosyası gereklidir")
    if 'port' in ssh and not isinstance(ssh['port'], int):
        raise ValueError("SSH portu sayı olmalıdır")

def run_ssh_command(host, config, command):
    print(f"\n[SSH] {host}")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    connect_args = {
        "hostname": host,
        "port": config['ssh'].get('port', 22),
        "username": config['ssh']['user'],
        "timeout": 10
    }

    if 'password' in config['ssh']:
        connect_args['password'] = config['ssh']['password']
    elif 'key_path' in config['ssh']:
        connect_args['key_filename'] = os.path.expanduser(config['ssh']['key_path'])

    try:
        ssh.connect(**connect_args)
        stdin, stdout, stderr = ssh.exec_command(command)
        output = stdout.read().decode().strip()
        error = stderr.read().decode().strip()

        if output:
            print(f"[ÇIKTI] {output}")
        if error:
            print(f"[HATA] {error}")
    except Exception as e:
        print(f"[HATA] SSH bağlantı hatası: {e}")
    finally:
        ssh.close()

def run_task_file(task_file, servers, config):
    commands = load_yaml(task_file)['commands']
    for host in servers:
        for command in commands:
            run_ssh_command(host['host'], config, command)

def interactive_mode(servers, config):
    print("[BİLGİ] Etkileşimli mod. Çıkmak için 'exit' yazın.")
    while True:
        try:
            cmd = input("\nKomut > ").strip()
            if cmd.lower() == 'exit':
                break
            for host in servers:
                run_ssh_command(host['host'], config, cmd)
        except KeyboardInterrupt:
            print("\n[BİLGİ] Çıkılıyor...")
            break

def main():
    parser = argparse.ArgumentParser(description="SSH Yönetim Aracı")
    parser.add_argument('-i', '--input', help='YAML görev dosyası')
    args = parser.parse_args()

    try:
        config = load_yaml("config.yaml")
        validate_config(config)
        servers = load_yaml("source.yaml")['servers']
    except Exception as e:
        print(f"[HATA] Yapılandırma hatası: {e}")
        return

    if args.input:
        run_task_file(args.input, servers, config)
    else:
        interactive_mode(servers, config)

if __name__ == "__main__":
    main()
