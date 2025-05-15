import yaml
import paramiko

def load_yaml(path):
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def ssh_session(host, port, user, password):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=port, username=user, password=password, timeout=15)
    channel = ssh.invoke_shell()  # interactive shell
    return ssh, channel

def read_output(channel):
    import time
    output = ""
    while True:
        if channel.recv_ready():
            out = channel.recv(1024).decode()
            output += out
        else:
            time.sleep(0.1)
            break
    return output

def main():
    config = load_yaml('config.yaml').get('ssh', {})
    sources = load_yaml('sources.yaml').get('sources', [])

    sessions = {}
    channels = {}

    # Her host için ssh session ve channel aç
    for source in sources:
        if isinstance(source, dict):
            host = source.get('host')
            port = source.get('port', config.get('port', 22))
        else:
            host = source
            port = config.get('port', 22)

        ssh, channel = ssh_session(host, port, config.get('user'), config.get('password'))
        sessions[host] = ssh
        channels[host] = channel
        # Kanal ilk açıldığında bazen prompt vs gelir, bunu oku atla
        read_output(channel)

    try:
        while True:
            cmd = input("shell # ")
            if cmd.lower() == "exit":
                break
            if not cmd.strip():
                continue

            for host, channel in channels.items():
                # Komut gönder
                channel.send(cmd + "\n")

            import time
            # Kısa süre bekle, sonra çıktıları oku
            time.sleep(1)

            for host, channel in channels.items():
                output = read_output(channel)
                print("-" * 36)
                print(f"{host}:{config.get('port',22)}")
                print("output # ")
                print(output.strip())
    finally:
        for ssh in sessions.values():
            ssh.close()

if __name__ == "__main__":
    main()
