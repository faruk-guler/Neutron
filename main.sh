#!/bin/bash
source config.ner || { echo -e "\033[1;31mConfig hatası!\033[0m"; exit 1; }
source sources.ner || { echo -e "\033[1;31mSources hatası!\033[0m"; exit 1; }

while read -p "shell # " -er CMD; do
    [[ -z "$CMD" ]] && continue
    [[ "$CMD" == "exit" ]] && break
    
    # cd komutunu otomatik birleştir
    if [[ "$CMD" == cd* ]]; then
        NEW_DIR="${CMD#cd }"
        CMD="cd \"$NEW_DIR\" 2>/dev/null || echo -e '\033[1;31mDizin yok: $NEW_DIR\033[0m'"
    fi
    
    # Tüm sunuculara paralel gönderim
    for HOST_PORT in "${HOSTS[@]}"; do (
        IFS=: read HOST PORT <<< "$HOST_PORT"
        
        # Renkli başlık
        echo -e "\n\033[1;34m--- $HOST:$PORT ---\033[0m"
        
        # Komut çalıştırma
        OUTPUT=$(sshpass -p "$PASSWORD" ssh -n \
          -o ConnectTimeout=3 \
          -o StrictHostKeyChecking=no \
          -p $PORT $USER@$HOST "$CMD" 2>&1)
        
        # Renkli çıktı
        if [ $? -ne 0 ]; then
            echo -e "\033[1;31m$OUTPUT\033[0m"
        else
            echo -e "\033[1;32m$OUTPUT\033[0m"
        fi
    ) & done
    wait
done
