# (SSH authorized_keys) -farukguler.com

# Create SSH Key
```
ssh-keygen -t ed25519 -f /root/.ssh/neutron.key
```
# SSH Key Perm.
```
chmod 600 ~/.ssh/neutron.key
```
# Deleting a server's old SSH key from the known_hosts file
```
ssh-keygen -f "/root/.ssh/known_hosts" -R "devops.example.com"
sh-keygen -f "/root/.ssh/known_hosts" -R "192.168.44.145"
```

# Copy SSH Key to Hosts
```
ssh-copy-id -i /root/.ssh/neutron.key.pub root@192.168.44.145
ssh-copy-id -i /root/.ssh/neutron.key.pub root@192.168.44.146
ssh-copy-id -i /root/.ssh/neutron.key.pub root@192.168.44.147
```
# Test SSH Key
```
ssh -i /root/.ssh/neutron.key root@192.168.44.145
```
