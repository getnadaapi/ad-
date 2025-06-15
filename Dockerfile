# -------- BASE IMAGE --------
FROM debian:bullseye-slim

# -------- CÀI GÓI CẦN THIẾT --------
RUN apt-get update && apt-get install -y \
    wget curl ca-certificates procps bash \
    && rm -rf /var/lib/apt/lists/*

# -------- THƯ MỤC AGENT --------
WORKDIR /opt/meshagent

# -------- MÃ MỜI GẮN SẴN (link build agent có sẵn config) --------
ENV MESH_AGENT_URL="https://appgologin.duckdns.org/meshagents?id=SiodyEwfE9%24n67QI6Oie6ZD26WvCRsZj6RrJP0J8eaBxOwY8yE%24HNHtKUtAOTsgE&installflags=0&meshinstall=6"

# -------- TẢI AGENT + PHÂN QUYỀN --------
RUN wget -O meshagent "$MESH_AGENT_URL" && \
    chmod +x meshagent

# -------- CHẠY AGENT Ở CHẾ ĐỘ -CONNECT --------
CMD ["./meshagent", "-connect"]
