#!/bin/bash
source config.ner || exit 1
source sources.ner || exit 1

declare -A current_dir
for host_port in "${HOSTS[@]}"; do
    IFS=: read host _ <<< "$host_port"
    current_dir["$host"]="/root"
done

while read -p "shell # " -er cmd; do
    [ -z "$cmd" ] && continue
    [ "$cmd" = "exit" ] && break
    
    if [[ "$cmd" = cd* ]]; then
        dir="${cmd#cd }"
        for host_port in "${HOSTS[@]}"; do
            IFS=: read host port <<< "$host_port"
            current_dir["$host"]="$dir"
        done
        continue
    fi
    
    # Tüm çıktıları topla
    declare -A outputs
    for host_port in "${HOSTS[@]}"; do
        IFS=: read host port <<< "$host_port"
        outputs["$host"]=$(
            sshpass -p "$PASSWORD" ssh -n \
            -o ConnectTimeout=3 \
            -o StrictHostKeyChecking=no \
            -p "$port" "$USER@$host" \
            "cd \"${current_dir["$host"]}\" && $cmd" 2>&1
        )
    done
    
    # Çıktıları düzenli göster
    for host_port in "${HOSTS[@]}"; do
        IFS=: read host port <<< "$host_port"
        echo -e "\n--------------- $host:$port ---------------"
        echo "${outputs["$host"]}"
        echo "----------------------------------------"
    done
done
