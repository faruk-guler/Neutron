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
${GREEN}# Neutron v10 ${NC}
# Lightweight and Powerful automation tool for Linux/Unix
# Page: www.farukguler.com github.com/faruk-guler
# Author: faruk-guler

${YELLOW}Neutron Usage:${NC}
${GREEN}cd <directory>${NC}          : Change directory on all remote hosts
${GREEN}put <local_path> [path]${NC} : Upload file/directory to all remote hosts (parallel)
${GREEN}get <remote_path> [dir]${NC} : Download file/directory from all remote hosts (parallel)
${GREEN}<any_shell_cmd>${NC}         : Run shell command on all remote hosts
${RED}exit${NC}                    : Exit Neutron
${CYAN}###########################################################${NC}"

# History file
HISTORY_FILE="$HOME/.neutron_history"
touch "$HISTORY_FILE"

# SSH connection multiplexing settings
SSH_CONTROL_PATH="$HOME/.ssh/neutron-%r@%h:%p"
SSH_MASTER_OPTIONS="-o ControlMaster=auto -o ControlPath=$SSH_CONTROL_PATH -o ControlPersist=60s"

# Readline settings (for interactive shell)
if [[ $- == *i* ]]; then
    bind '"\e[A": history-search-backward' # Up arrow: search history backward
    bind '"\e[B": history-search-forward'  # Down arrow: search history forward
    bind 'set show-all-if-ambiguous on'
    bind 'set completion-ignore-case on'
    bind 'TAB: menu-complete'
fi

# Load configuration files
source config.ntr || { echo -e "${RED}Error: config.ntr not found! Please create it and enter your SSH credentials.${NC}"; exit 1; }
source sources.ntr || { echo -e "${RED}Error: sources.ntr not found! Please create it and enter your server list.${NC}"; exit 1; }

[ -z "${HOSTS+x}" ] && { echo "Error: HOSTS not defined in sources.ntr" >&2; exit 1; }
[ -z "${USER+x}" ] && { echo "Error: USER not defined in config.ntr" >&2; exit 1; }

# Private key validation function
validate_private_key() {
    local key_file="$1"

    if [ -z "$key_file" ]; then
        echo -e "${RED}Error: PRIVATE_KEY_FILE not specified in config.ntr${NC}" >&2
        return 1
    fi

    if [ ! -f "$key_file" ]; then
        echo -e "${RED}Error: Private key file '$key_file' does not exist${NC}" >&2
        return 1
    fi

    if [ ! -r "$key_file" ]; then
        echo -e "${RED}Error: Private key file '$key_file' is not readable${NC}" >&2
        return 1
    fi

    # Check file permissions (should be 600 or 400)
    local perms=$(stat -c "%a" "$key_file" 2>/dev/null)
    if [[ "$perms" != "600" && "$perms" != "400" ]]; then
        echo -e "${YELLOW}Warning: Private key file permissions should be 600 or 400 (current: $perms)${NC}" >&2
    fi

    # Validate key format
    if ! ssh-keygen -l -f "$key_file" >/dev/null 2>&1; then
        echo -e "${RED}Error: Invalid private key format in '$key_file'${NC}" >&2
        return 1
    fi

    return 0
}

# Validate private key once at startup
if ! validate_private_key "$PRIVATE_KEY_FILE"; then
    exit 1
fi

# SSH connection multiplexing setup function
setup_ssh_multiplexing() {
    local host_or_ip="$1"
    local port="$2"
    
    # Create SSH control directory if it doesn't exist
    mkdir -p "$HOME/.ssh" 2>/dev/null
    
    # Check if master connection already exists
    if ! ssh -O check -o ControlPath="$SSH_CONTROL_PATH" "$USER@$host_or_ip" >/dev/null 2>&1; then
        # Start master connection
        ssh $SSH_MASTER_OPTIONS \
            -o ConnectTimeout=10 \
            -o StrictHostKeyChecking=no \
            -p "$port" \
            -i "$PRIVATE_KEY_FILE" \
            -N -f \
            "$USER@$host_or_ip" >/dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}SSH multiplexing established for $host_or_ip${NC}" >&2
        else
            echo -e "${YELLOW}Warning: Could not establish SSH multiplexing for $host_or_ip${NC}" >&2
        fi
    fi
}

# SSH command builder function (to avoid repetition)
build_ssh_cmd() {
    local host_or_ip="$1"
    local port="$2"
    local options="$3"

    # Use declare instead of local since this might be called outside functions
    declare -a ssh_args=(
        $SSH_MASTER_OPTIONS
        $options
        -o ConnectTimeout=3
        -o StrictHostKeyChecking=no
        -p "$port"
        -i "$PRIVATE_KEY_FILE"
        "$USER@$host_or_ip"
    )
    echo "${ssh_args[@]}"
}

# SCP command builder function
build_scp_cmd() {
    local host_or_ip="$1"
    local port="$2"
    local options="$3"

    declare -a scp_args=(
        $SSH_MASTER_OPTIONS
        $options
        -P "$port"
        -o StrictHostKeyChecking=no
        -i "$PRIVATE_KEY_FILE"
    )
    echo "${scp_args[@]}"
}

# Connection pool management
declare -A connection_pool
connection_pool_size=0
max_pool_size=10

# Initialize connection pool
init_connection_pool() {
    echo -e "${BLUE}Initializing SSH connection pool...${NC}"
    
    for host_port_entry in "${HOSTS[@]}"; do
        IFS=: read host_or_ip port <<< "$host_port_entry"
        
        # Setup SSH multiplexing for each host
        setup_ssh_multiplexing "$host_or_ip" "$port"
        
        # Add to connection pool
        connection_pool["$host_or_ip"]="active"
        ((connection_pool_size++))
    done
    
    echo -e "${GREEN}Connection pool initialized with $connection_pool_size hosts${NC}"
}

# Clean up SSH multiplexing connections
cleanup_ssh_connections() {
    echo -e "${BLUE}Cleaning up SSH connections...${NC}"
    
    for host_or_ip in "${!connection_pool[@]}"; do
        ssh -O exit -o ControlPath="$SSH_CONTROL_PATH" "$USER@$host_or_ip" >/dev/null 2>&1
    done
    
    # Remove control sockets
    rm -f "$HOME/.ssh/neutron-"* 2>/dev/null
    echo -e "${GREEN}SSH connections cleaned up${NC}"
}

# Initialize session data
declare -A current_dir host_ports host_names outputs

# Initialize connection pool first
init_connection_pool

# Initialize current_dir for each host and fetch hostnames once
for host_port_entry in "${HOSTS[@]}"; do
    IFS=: read host_or_ip port <<< "$host_port_entry"
    current_dir["$host_or_ip"]="/tmp"
    host_ports["$host_or_ip"]="$port"

    # Fetch hostname once at startup using the connection pool
    declare -a ssh_cmd_arr=($(build_ssh_cmd "$host_or_ip" "$port" "-n"))
    remote_hostname=$(ssh "${ssh_cmd_arr[@]}" "hostname" 2>/dev/null)

    if [ -z "$remote_hostname" ]; then
        echo -e "${YELLOW}Warning: Could not get hostname for $host_or_ip. Using original target for display.${NC}" >&2
        host_names["$host_or_ip"]="$host_or_ip"
    else
        host_names["$host_or_ip"]="$remote_hostname"
    fi
done

# Clean up temporary files and SSH connections on exit
trap 'rm -f "${outputs[@]}"; cleanup_ssh_connections' EXIT

# Load command history
history -r "$HISTORY_FILE"

# Main loop
while read -e -p "$(echo -e "${GREEN}shell # ${NC}")" -r cmd; do
    history -s "$cmd"
    history -w "$HISTORY_FILE"

    [ -z "$cmd" ] && continue
    [ "$cmd" = "exit" ] && break

    # Declare jobs array here for each command cycle
    declare -A jobs

    # Handle "cd" command
    if [[ "$cmd" =~ ^cd ]]; then
        dir="${cmd#cd }"
        for host_or_ip in "${!current_dir[@]}"; do
            port="${host_ports[$host_or_ip]}"
            declare -a ssh_cmd_arr=($(build_ssh_cmd "$host_or_ip" "$port" ""))

            # Execute cd and check its success directly
            if ssh "${ssh_cmd_arr[@]}" "test -d \"$dir\" && cd \"$dir\""; then
                current_dir["$host_or_ip"]="$dir"
            else
                echo -e "${YELLOW}Warning: Directory $dir does not exist or could not be changed on ${host_names[$host_or_ip]}.${NC}"
            fi
        done
        continue
    fi

    # Handle "put" command (file or directory) - Parallel SCP
    if [[ "$cmd" =~ ^put ]]; then
        IFS=' ' read -ra tokens <<< "${cmd#put }"
        local_path="${tokens[0]}"
        remote_path="${tokens[1]:-/tmp}"

        if [ ! -e "$local_path" ]; then
            echo -e "${RED}Error: Local path $local_path does not exist.${NC}"
            continue
        fi

        for host_or_ip in "${!current_dir[@]}"; do
            port="${host_ports[$host_or_ip]}"
            echo -e "${GREEN}Uploading $local_path to ${host_names[$host_or_ip]}:${remote_path}${NC}"

            declare -a scp_cmd_arr=($(build_scp_cmd "$host_or_ip" "$port" ""))

            if [ -d "$local_path" ]; then
                scp "${scp_cmd_arr[@]}" -r "$local_path" "$USER@$host_or_ip:$remote_path" &
            else
                scp "${scp_cmd_arr[@]}" "$local_path" "$USER@$host_or_ip:$remote_path" &
            fi
            jobs["$host_or_ip"]="$!"
        done

        # Wait for all transfers to complete
        for host_or_ip in "${!jobs[@]}"; do
            wait "${jobs[$host_or_ip]}"
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}Successfully uploaded $local_path to ${host_names[$host_or_ip]}${NC}"
            else
                echo -e "${RED}Failed to upload $local_path to ${host_names[$host_or_ip]}${NC}"
            fi
        done
        continue
    fi

    # Handle "get" command (file or directory)
    if [[ "$cmd" =~ ^get ]]; then
        IFS=' ' read -ra tokens <<< "${cmd#get }"
        remote_path="${tokens[0]}"
        local_dir="${tokens[1]:-./downloads}"

        mkdir -p "$local_dir" 2>/dev/null || {
            echo -e "${RED}Error: Cannot create or access directory $local_dir${NC}"
            continue
        }

        for host_or_ip in "${!current_dir[@]}"; do
            port="${host_ports[$host_or_ip]}"
            echo -e "${GREEN}Downloading $remote_path from ${host_names[$host_or_ip]} to $local_dir/${NC}"

            declare -a scp_cmd_arr=($(build_scp_cmd "$host_or_ip" "$port" ""))
            declare -a ssh_cmd_arr=($(build_ssh_cmd "$host_or_ip" "$port" ""))

            target_dir="$local_dir/${host_names[$host_or_ip]}"
            mkdir -p "$target_dir" 2>/dev/null || {
                echo -e "${RED}Error: Cannot create directory $target_dir for ${host_names[$host_or_ip]}${NC}"
                continue
            }

            target_file="$target_dir/$(basename "$remote_path")"

            # Check if remote path is a directory
            is_dir=$(ssh "${ssh_cmd_arr[@]}" "[ -d \"$remote_path\" ] && echo 'yes' || echo 'no'" 2>/dev/null)

            if [ "$is_dir" = "yes" ]; then
                scp "${scp_cmd_arr[@]}" -r "$USER@$host_or_ip:$remote_path" "$target_dir" &
            else
                scp "${scp_cmd_arr[@]}" "$USER@$host_or_ip:$remote_path" "$target_file" &
            fi

            jobs["$host_or_ip"]="$!"
        done

        for host_or_ip in "${!jobs[@]}"; do
            wait "${jobs[$host_or_ip]}"
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}Successfully downloaded $remote_path from ${host_names[$host_or_ip]}${NC}"
            else
                echo -e "${RED}Failed to download $remote_path from ${host_names[$host_or_ip]}${NC}"
            fi
        done
        continue
    fi

    # Handle all other commands
    first_output_block=true
    for host_or_ip in "${!current_dir[@]}"; do
        port="${host_ports[$host_or_ip]}"
        temp_file=$(mktemp)
        outputs["$host_or_ip"]="$temp_file"

        declare -a ssh_cmd_arr=($(build_ssh_cmd "$host_or_ip" "$port" "-n"))
        remote_cmd="cd \"${current_dir[$host_or_ip]}\" && $cmd"

        # Execute ssh command directly using the array
        ssh "${ssh_cmd_arr[@]}" "$remote_cmd" > "$temp_file" 2>&1 &
        jobs["$host_or_ip"]="$!"
    done

    # Print results from all hosts
    first_output_block=true
    for host_or_ip in "${!jobs[@]}"; do
        wait_status=0
        wait "${jobs[$host_or_ip]}" || wait_status=$?

        # Use the pre-fetched hostname
        remote_display_name="${host_names[$host_or_ip]}"

        mapfile -t lines < "${outputs[$host_or_ip]}"

        # Only print if there's output OR if the command exited with a non-zero status
        if [ ${#lines[@]} -gt 0 ] || [ $wait_status -ne 0 ]; then
            if ! $first_output_block; then
                echo ""
            fi
            echo -e "${BLUE}host: ${remote_display_name}${NC}"
            echo -e "${BLUE}--------------------------------------------${NC}"

            if [ ${#lines[@]} -gt 0 ]; then
                printf "%s\n" "${lines[@]}"
            fi

            echo -e "${RED}--------------------------------------------${NC}"
        fi
        rm "${outputs[$host_or_ip]}"
        first_output_block=false
    done
done
