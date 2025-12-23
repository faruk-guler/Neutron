#!/bin/bash

# Modern color definitions (RGB support)
GREEN='\033[38;5;46m'
BLUE='\033[38;5;33m'
YELLOW='\033[38;5;226m'
CYAN='\033[38;5;51m'
RED='\033[38;5;196m'
GRAY='\033[38;5;240m'
NC='\033[0m' # No Color

# Simple Banner

echo -e "${CYAN}------------------------------------------------------${NC}"
echo -e "${CYAN}######################################################${NC}"
echo -e "${CYAN}------------------------------------------------------${NC}"
echo -e "${GREEN}  Neutron v10${NC} - ${GRAY}Automation Tool${NC}"
echo -e "${GRAY}  Author: faruk-guler | github.com/faruk-guler${NC}"
echo -e "${CYAN}------------------------------------------------------${NC}"
echo ""
echo -e "${YELLOW}Commands:${NC}"
printf "  ${BLUE}%-25s${NC} ${GRAY}%s${NC}\n" "cd <directory>"        "Change directory on remote hosts"
printf "  ${BLUE}%-25s${NC} ${GRAY}%s${NC}\n" "push <local> [remote]" "Upload file/directory"
printf "  ${BLUE}%-25s${NC} ${GRAY}%s${NC}\n" "pull <remote> [local]" "Download file/directory"
printf "  ${BLUE}%-25s${NC} ${GRAY}%s${NC}\n" "<command>"             "Run shell command"
printf "  ${RED}%-25s${NC} ${GRAY}%s${NC}\n" "exit"                  "Exit Neutron"
echo -e "${CYAN}------------------------------------------------------${NC}"
echo ""

# History file
HISTORY_FILE="$HOME/.neutron_history"
touch "$HISTORY_FILE"
chmod 600 "$HISTORY_FILE"

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

# Load configuration from YAML
parse_config() {
    local yaml_file="$1"
    [ ! -f "$yaml_file" ] && { echo -e "${RED}Error: $yaml_file not found!${NC}"; exit 1; }

    # Simple grep-based parser for our flat structure
    # Sanitize inputs to prevent command injection
    raw_user=$(grep "^ssh_user:" "$yaml_file" | awk -F': ' '{print $2}' | tr -d '"' | tr -d '\r')
    SSH_USER=$(echo "$raw_user" | tr -cd 'a-zA-Z0-9_-') # Allow only alphanumeric, hyphen, underscore
    
    PRIVATE_KEY_FILE=$(grep "^private_key_file:" "$yaml_file" | awk -F': ' '{print $2}' | cut -d'#' -f1 | tr -d '"' | tr -d '\r' | xargs)
    # Expand tilde to home directory
    PRIVATE_KEY_FILE="${PRIVATE_KEY_FILE/#\~/$HOME}"
    
    STRICT_HOST_KEY_CHECKING=$(grep "^strict_host_key_checking:" "$yaml_file" | awk -F': ' '{print $2}' | cut -d'#' -f1 | tr -d '"' | tr -d '\r' | xargs)
    STRICT_HOST_KEY_CHECKING=${STRICT_HOST_KEY_CHECKING:-no} # Default to no
    
    # Read hosts list
    mapfile -t HOSTS < <(grep -A 100 "^hosts:" "$yaml_file" | grep "  - " | awk -F'- ' '{print $2}' | cut -d'#' -f1 | tr -d '"' | tr -d '\r' | sed 's/^[ \t]*//;s/[ \t]*$//' | grep -v "^$")
}

parse_config "config.yaml"

[ ${#HOSTS[@]} -eq 0 ] && { echo "Error: No hosts defined in config.yaml" >&2; exit 1; }
[ -z "$SSH_USER" ] && { echo "Error: ssh_user not defined in config.yaml" >&2; exit 1; }

# Private key validation function
validate_private_key() {
    local key_file="$1"

    if [ -z "$key_file" ]; then
        echo -e "${RED}Error: PRIVATE_KEY_FILE not specified in config.yaml${NC}" >&2
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
    if ! ssh -O check -o ControlPath="$SSH_CONTROL_PATH" "$SSH_USER@$host_or_ip" >/dev/null 2>&1; then
        # Prepare temp file for error logging
        local err_log=$(mktemp)
        
        # Start master connection
        ssh -o ControlMaster=auto \
            -o "ControlPath=$SSH_CONTROL_PATH" \
            -o ControlPersist=60s \
            -o ConnectTimeout=10 \
            -o StrictHostKeyChecking="$STRICT_HOST_KEY_CHECKING" \
            -p "$port" \
            -i "$PRIVATE_KEY_FILE" \
            -N -f \
            "$SSH_USER@$host_or_ip" >/dev/null 2>"$err_log"
        
        if [ $? -eq 0 ]; then
            : # echo -e "${GREEN}SSH multiplexing established for $host_or_ip${NC}" >&2
            rm "$err_log"
        else
            echo -e "${YELLOW}Warning: Could not establish SSH multiplexing for $host_or_ip${NC}" >&2
            echo -e "${RED}SSH Error: $(cat "$err_log")${NC}" >&2
            rm "$err_log"
        fi
    fi
}

# SSH command builder function (to avoid repetition)
build_ssh_cmd() {
    local host_or_ip="$1"
    local port="$2"
    local options="$3"


    declare -a ssh_args=(
        -o ControlMaster=auto
        -o "ControlPath=$SSH_CONTROL_PATH"
        -o ControlPersist=60s
        $options
        -o ConnectTimeout=3
        -o StrictHostKeyChecking="$STRICT_HOST_KEY_CHECKING"
        -p "$port"
        -i "$PRIVATE_KEY_FILE"
        "$SSH_USER@$host_or_ip"
    )
    echo "${ssh_args[@]}"
}

# SCP command builder function
build_scp_cmd() {
    local host_or_ip="$1"
    local port="$2"
    local options="$3"

    declare -a scp_args=(
        -o ControlMaster=auto
        -o "ControlPath=$SSH_CONTROL_PATH"
        -o ControlPersist=60s
        $options
        -P "$port"
        -o StrictHostKeyChecking="$STRICT_HOST_KEY_CHECKING"
        -i "$PRIVATE_KEY_FILE"
    )
    echo "${scp_args[@]}"
}

# Connection pool management
declare -A connection_pool
connection_pool_size=0

# Initialize connection pool
init_connection_pool() {
    # echo -e "${BLUE}Initializing SSH connection pool...${NC}"
    
    for host_port_entry in "${HOSTS[@]}"; do
        IFS=: read host_or_ip port <<< "$host_port_entry"
        
        # Setup SSH multiplexing for each host
        setup_ssh_multiplexing "$host_or_ip" "$port"
        
        # Add to connection pool
        connection_pool["$host_or_ip"]="active"
        ((connection_pool_size++))
    done
    
    # echo -e "${GREEN}Connection pool initialized with $connection_pool_size hosts${NC}"
}

# Clean up SSH multiplexing connections
cleanup_ssh_connections() {
    echo -e "${BLUE}Cleaning up SSH connections...${NC}"
    
    for host_or_ip in "${!connection_pool[@]}"; do
        ssh -O exit -o ControlPath="$SSH_CONTROL_PATH" "$SSH_USER@$host_or_ip" >/dev/null 2>&1
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

# Process a single command line
process_command() {
    local cmd="$1"
    
    [ -z "$cmd" ] && return
    [ "$cmd" = "exit" ] && exit 0

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
        return
    fi

    # Handle "push" command (file or directory) - Parallel SCP
    # Handle "push" command (file or directory) - Parallel SCP
    if [[ "$cmd" =~ ^push ]]; then
        # Use xargs to correctly parse quoted arguments (handles spaces in filenames)
        mapfile -t tokens < <(echo "${cmd#push }" | xargs -n 1 2>/dev/null)
        local_path="${tokens[0]}"
        remote_path="${tokens[1]:-/tmp}"

        if [ ! -e "$local_path" ]; then
            echo -e "${RED}Error: Local path $local_path does not exist.${NC}"
            return
        fi

        for host_or_ip in "${!current_dir[@]}"; do
            port="${host_ports[$host_or_ip]}"
            echo -e "${GREEN}Uploading $local_path to ${host_names[$host_or_ip]}:${remote_path}${NC}"

            declare -a scp_cmd_arr=($(build_scp_cmd "$host_or_ip" "$port" ""))

            if [ -d "$local_path" ]; then
                scp "${scp_cmd_arr[@]}" -r "$local_path" "$SSH_USER@$host_or_ip:$remote_path" &
            else
                scp "${scp_cmd_arr[@]}" "$local_path" "$SSH_USER@$host_or_ip:$remote_path" &
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
        return
    fi

    # Handle "pull" command (file or directory)
    if [[ "$cmd" =~ ^pull ]]; then
        # Use xargs to correctly parse quoted arguments (handles spaces in filenames)
        mapfile -t tokens < <(echo "${cmd#pull }" | xargs -n 1 2>/dev/null)
        remote_path="${tokens[0]}"
        local_dir="${tokens[1]:-./downloads}"

        if [ ! -d "$local_dir" ]; then
            echo -e "${RED}Error: Local directory $local_dir does not exist.${NC}"
            return
        fi

        for host_or_ip in "${!current_dir[@]}"; do
            port="${host_ports[$host_or_ip]}"
            echo -e "${GREEN}Downloading $remote_path from ${host_names[$host_or_ip]} to $local_dir/${NC}"

            declare -a scp_cmd_arr=($(build_scp_cmd "$host_or_ip" "$port" ""))
            declare -a ssh_cmd_arr=($(build_ssh_cmd "$host_or_ip" "$port" ""))

            target_dir="$local_dir/${host_names[$host_or_ip]}"
            mkdir -p "$target_dir" 2>/dev/null || {
                echo -e "${RED}Error: Cannot create directory $target_dir for ${host_names[$host_or_ip]}${NC}"
                return
            }

            target_file="$target_dir/$(basename "$remote_path")"

            # Check if remote path is a directory
            is_dir=$(ssh "${ssh_cmd_arr[@]}" "[ -d \"$remote_path\" ] && echo 'yes' || echo 'no'" 2>/dev/null)

            if [ "$is_dir" = "yes" ]; then
                scp "${scp_cmd_arr[@]}" -r "$SSH_USER@$host_or_ip:$remote_path" "$target_dir" &
            else
                scp "${scp_cmd_arr[@]}" "$SSH_USER@$host_or_ip:$remote_path" "$target_file" &
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
        return
    fi

    # Handle all other commands

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
}

# Check if a deployment file argument is provided
if [ $# -ge 1 ]; then
    DEPLOY_FILE="$1"
    if [ ! -f "$DEPLOY_FILE" ]; then
        echo -e "${RED}Error: Deployment file '$DEPLOY_FILE' not found.${NC}"
        exit 1
    fi

    echo -e "${CYAN}Running deployment plan from: $DEPLOY_FILE${NC}"
    
    # Parse YAML commands list
    
    in_commands_section=false
    
    while IFS= read -r line || [ -n "$line" ]; do
        # Trim whitespace
        lines=$(echo "$line" | sed 's/^[ \t]*//;s/[ \t]*$//')
        
        # Skip empty lines and comments
        [[ -z "$lines" ]] && continue
        [[ "$lines" == \#* ]] && continue
        
        if [[ "$lines" == "commands:"* ]]; then
            in_commands_section=true
            continue
        fi
        
        if $in_commands_section; then
            # Check for list items starting with -
            if [[ "$lines" == -* ]]; then
                # Remove leading "- " and optional quotes
                cmd="${lines#*-\ }"
                cmd="${cmd%\"}"
                cmd="${cmd#\"}"
                cmd="${cmd%\'}"
                cmd="${cmd#\'}"
                
                echo -e "\n${YELLOW}Executing: $cmd${NC}"
                process_command "$cmd"
            fi
        fi
    done < "$DEPLOY_FILE"
    
    echo -e "${CYAN}Deployment completed.${NC}"
    exit 0
fi

# Main loop (Interactive Mode)
while read -e -p "$(echo -e "${GREEN}shell # ${NC}")" -r cmd; do
    history -s "$cmd"
    history -w "$HISTORY_FILE"

    process_command "$cmd"
done
