#!/bin/bash

# Color definitions
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Banner
echo -e "${CYAN}###########################################################${NC}
${GREEN}# Neutron v7${NC}
# Lightweight and Powerful automation tool for Linux/Unix
# Page: www.farukguler.com github.com/faruk-guler
# Author: faruk-guler
#
${YELLOW}Usage:${NC}
${GREEN}cd <directory>${NC}          : Change directory on all remote hosts
${GREEN}put <local_path> [path]${NC} : Upload file/directory to all remote hosts (parallel)
${GREEN}get <remote_path> [dir]${NC} : Download file/directory from all remote hosts (parallel)
${GREEN}<any_shell_cmd>${NC}         : Run shell command on all remote hosts
${GREEN}exit${NC}                    : Exit Neutron
${CYAN}###########################################################${NC}"

# History file
HISTORY_FILE="$HOME/.neutron_history"
touch "$HISTORY_FILE"

# Readline settings (for interactive shell)
if [[ $- == *i* ]]; then
    bind '"\e[A": history-search-backward' # Up arrow: search history backward
    bind '"\e[B": history-search-forward'  # Down arrow: search history forward
    bind 'set show-all-if-ambiguous on'
    bind 'set completion-ignore-case on'
    bind 'TAB: menu-complete'
fi

# Load configuration files
source config.ner || { echo -e "${RED}Error: config.ner not found! Please create it and enter your SSH credentials.${NC}"; exit 1; }
source sources.ner || { echo -e "${RED}Error: sources.ner not found! Please create it and enter your server list.${NC}"; exit 1; }

[ -z "${HOSTS+x}" ] && { echo "Error: HOSTS not defined in sources.ner"; exit 1; }
[ -z "${USER+x}" ] && { echo "Error: USER not defined in config.ner"; exit 1; }

# Initialize session data
declare -A current_dir host_ports

for host_port in "${HOSTS[@]}"; do
    IFS=: read host port <<< "$host_port"
    current_dir["$host"]="/root"
    host_ports["$host"]="$host:$port"
done

# Clean up temporary files on exit
trap 'rm -f "${outputs[@]}"' EXIT

# Load command history
history -r "$HISTORY_FILE"

# Main loop
while read -e -p "$(echo -e "${GREEN}shell # ${NC}")" -r cmd; do
    history -s "$cmd"
    history -w "$HISTORY_FILE"

    [ -z "$cmd" ] && continue
    [ "$cmd" = "exit" ] && break

    # Handle "cd" command
    if [[ "$cmd" =~ ^cd ]]; then
        dir="${cmd#cd }"
        for host in "${!current_dir[@]}"; do
            IFS=: read _ port <<< "${host_ports[$host]}"
            ssh_base="ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\""

            if [ -n "$PRIVATE_KEY_FILE" ] && [ -f "$PRIVATE_KEY_FILE" ]; then
                ssh_cmd="$ssh_base -i \"$PRIVATE_KEY_FILE\""
            else
                echo -e "${YELLOW}Error: No private key file specified for $host! Set PRIVATE_KEY_FILE in config.ner.${NC}"
                continue
            fi

            eval "$ssh_cmd \"test -d \\\"$dir\\\"\"" && current_dir["$host"]="$dir" || \
                echo -e "${YELLOW}Warning: Directory $dir does not exist on $host.${NC}"
        done
        continue
    fi

    # Handle "put" command (file or directory) - Parallel SCP
    if [[ "$cmd" =~ ^put ]]; then
        IFS=' ' read -ra tokens <<< "${cmd#put }"
        local_path="${tokens[0]}"
        remote_path="${tokens[1]:-/root}"

        if [ ! -e "$local_path" ]; then
            echo -e "${RED}Error: Local path $local_path does not exist.${NC}"
            continue
        fi

        declare -A jobs

        for host in "${!current_dir[@]}"; do
            IFS=: read _ port <<< "${host_ports[$host]}"
            host_name=$(echo "${host_ports[$host]}" | cut -d':' -f1)

            echo -e "${GREEN}Uploading $local_path to $host_name:${remote_path}${NC}"

            scp_base="scp -P \"$port\" -o StrictHostKeyChecking=no"
            if [ -n "$PRIVATE_KEY_FILE" ] && [ -f "$PRIVATE_KEY_FILE" ]; then
                scp_cmd="$scp_base -i \"$PRIVATE_KEY_FILE\""
            else
                echo -e "${YELLOW}Error: No private key file specified for $host! Set PRIVATE_KEY_FILE in config.ner.${NC}"
                continue
            fi

            if [ -d "$local_path" ]; then
                eval "$scp_cmd -r \"$local_path\" \"$USER@$host:$remote_path\" &"
            else
                eval "$scp_cmd \"$local_path\" \"$USER@$host:$remote_path\" &"
            fi

            jobs["$host"]="$!"
        done

        # Wait for all transfers to complete
        for host in "${!jobs[@]}"; do
            wait "${jobs[$host]}"
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}Successfully uploaded $local_path to $host${NC}"
            else
                echo -e "${RED}Failed to upload $local_path to $host${NC}"
            fi
        done

        continue
    fi

    # Handle "get" command (file or directory) - Sunucuya özel klasörlerle
    if [[ "$cmd" =~ ^get ]]; then
        IFS=' ' read -ra tokens <<< "${cmd#get }"
        remote_path="${tokens[0]}"
        local_dir="${tokens[1]:-./downloads}"

        mkdir -p "$local_dir" 2>/dev/null || {
            echo -e "${RED}Error: Cannot create or access directory $local_dir${NC}"
            continue
        }

        declare -A jobs

        for host in "${!current_dir[@]}"; do
            IFS=: read _ port <<< "${host_ports[$host]}"
            host_name=$(echo "${host_ports[$host]}" | cut -d':' -f1)

            echo -e "${GREEN}Downloading $remote_path from $host_name to $local_dir/${NC}"

            scp_base="scp -P \"$port\" -o StrictHostKeyChecking=no"
            if [ -n "$PRIVATE_KEY_FILE" ] && [ -f "$PRIVATE_KEY_FILE" ]; then
                scp_cmd="$scp_base -i \"$PRIVATE_KEY_FILE\""
            else
                echo -e "${YELLOW}Error: No private key file specified for $host! Set PRIVATE_KEY_FILE in config.ner.${NC}"
                continue
            fi

            # Sunucuya özel klasör oluştur
            target_dir="$local_dir/$host_name"
            mkdir -p "$target_dir" 2>/dev/null || {
                echo -e "${RED}Error: Cannot create directory $target_dir for $host${NC}"
                continue
            }

            target_file="$target_dir/$(basename "$remote_path")"

            # Uzakta dizin mi kontrol et
            is_dir=$(ssh -i "$PRIVATE_KEY_FILE" -p "$port" "$USER@$host" "[ -d \"$remote_path\" ] && echo 'yes' || echo 'no']")
            if [ "$is_dir" = "yes" ]; then
                eval "$scp_cmd -r \"$USER@$host:$remote_path\" \"$target_file\" &"
            else
                eval "$scp_cmd \"$USER@$host:$remote_path\" \"$target_file\" &"
            fi

            jobs["$host"]="$!"
        done

        # Wait for all transfers to complete
        for host in "${!jobs[@]}"; do
            wait "${jobs[$host]}"
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}Successfully downloaded $remote_path from $host${NC}"
            else
                echo -e "${RED}Failed to download $remote_path from $host${NC}"
            fi
        done

        continue
    fi

    # Handle all other commands
    unset -v jobs outputs
    declare -A jobs outputs

    for host in "${!current_dir[@]}"; do
        IFS=: read _ port <<< "${host_ports[$host]}"
        temp_file=$(mktemp)
        outputs["$host"]="$temp_file"

        ssh_base="ssh -n -o ConnectTimeout=3 -o StrictHostKeyChecking=no -p \"$port\" \"$USER@$host\""

        if [ -n "$PRIVATE_KEY_FILE" ] && [ -f "$PRIVATE_KEY_FILE" ]; then
            ssh_cmd="$ssh_base -i \"$PRIVATE_KEY_FILE\""
        else
            echo -e "${YELLOW}Error: No private key file specified for $host! Set PRIVATE_KEY_FILE in config.ner.${NC}"
            continue
        fi

        remote_cmd="cd \"${current_dir[$host]}\" && hostname && $cmd"
        eval "$ssh_cmd \"$remote_cmd\" > \"$temp_file\" 2>&1 &"
        jobs["$host"]="$!"
    done

    first=true
    for host in "${!jobs[@]}"; do
        wait "${jobs[$host]}"

        host_port="${host_ports[$host]}"
        host_name=$(echo "$host_port" | cut -d':' -f1)

        if ! $first; then
            echo ""
        fi

        echo -e "${BLUE}----------- $host_name -----------${NC}"
        mapfile -t lines < "${outputs[$host]}"
        echo -e "${GREEN}${lines[0]} ${CYAN}#${NC}"
        printf "%s\n" "${lines[@]:1}"
        echo -e "${BLUE}--------------------------------------------${NC}"
        rm "${outputs[$host]}"
        first=false
    done
done
