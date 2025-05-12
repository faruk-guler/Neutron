import yaml
import paramiko
import winrm
import os
import argparse

def load_yaml(path):
    with open(path, 'r') as f:
        return yaml.safe_load(f)

def run_ssh_command(server, config, command):
    print(f"\n[SSH] {server['host']}")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    connect_args = {
        "hostname": server['host'],
        "port": config['ssh'].get('port', 22),
        "username": config['ssh']['user'],
        "timeout": 10
    }

    if 'password' in config['ssh']:
        connect_args['password'] = config['ssh']['password']
    elif 'key_path' in config['ssh']:
        connect_args['key_filename'] = os.path.expanduser(config['ssh']['key_path'])
    else:
        print(f"[HATA] SSH bağlantısı için 'password' ya da 'key_path' tanımlı değil.")
        return

    try:
        ssh.connect(**connect_args)
        stdin, stdout, stderr = ssh.exec_command(command)

        output = stdout.read().decode().strip()
        error = stderr.read().decode().strip()

        if output:
            print(f"[ÇIKTI] {output}")
        if error:
            print(f"[HATA] {error}")

    except paramiko.AuthenticationException:
        print(f"[HATA] Kimlik doğrulama başarısız. Kullanıcı adı veya şifre hatalı olabilir.")
    except paramiko.SSHException as e:
        print(f"[HATA] SSH bağlantı hatası: {str(e)}")
    except Exception as e:
        print(f"[HATA] Beklenmedik bir hata oluştu: {str(e)}")
    finally:
        ssh.close()

def run_winrm_command(server, config, command):
    print(f"\n[WinRM] {server['host']}")
    try:
        session = winrm.Session(
            f"http://{server['host']}:{config['winrm'].get('port', 5985)}/wsman",
            auth=(config['winrm']['user'], config['winrm']['password'])
        )
        result = session.run_cmd(command)

        output = result.std_out.decode().strip()
        error = result.std_err.decode().strip()

        if output:
            print(f"[ÇIKTI] {output}")
        if error:
            print(f"[HATA] {error}")

    except Exception as e:
        print(f"[HATA] WinRM bağlantı hatası: {str(e)}")

def run_task_file(task_file, servers, config):
    try:
        tasks = load_yaml(task_file)
    except Exception as e:
        print(f"[HATA] Görev dosyası okunamadı: {e}")
        return

    for task in tasks.get('commands', []):
        task_type = task.get('type')
        command = task.get('command')
        for server in servers:
            if server['type'] == task_type:
                if task_type == 'ssh':
                    run_ssh_command(server, config, command)
                elif task_type == 'winrm':
                    run_winrm_command(server, config, command)

def interactive_mode(servers, config):
    print("Etkinleştirildi: Etkileşimli mod. Çıkmak için 'exit' yaz.")
    while True:
        user_input = input("\nKomut > ").strip()
        if user_input.lower() == 'exit':
            break
        for server in servers:
            if server['type'] == 'ssh':
                run_ssh_command(server, config, user_input)
            elif server['type'] == 'winrm':
                run_winrm_command(server, config, user_input)

def main():
    parser = argparse.ArgumentParser(description="SSH & WinRM yönetim aracı")
    parser.add_argument('-i', '--input', help='Komut dosyası (YAML) örnek: ssh-task.yaml')
    args = parser.parse_args()

    try:
        config = load_yaml("config.yaml")
        source = load_yaml("source.yaml")
        servers = source["servers"]
    except Exception as e:
        print(f"[HATA] config.yaml veya source.yaml okunamadı: {e}")
        return

    if args.input:
        run_task_file(args.input, servers, config)
    else:
        interactive_mode(servers, config)

if __name__ == "__main__":
    main()
