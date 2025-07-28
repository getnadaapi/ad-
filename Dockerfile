# -------- BASE: Debian + Node --------
FROM node:18-bullseye

# -------- CÀI CHROME + SUDO + CÔNG CỤ --------
RUN apt update && apt install -y \
    wget curl gnupg sudo bash passwd

# -------- CÀI CHROME --------
RUN curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-linux.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt update && apt install -y google-chrome-stable

# -------- ENV CHROMIUM --------
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production

# -------- TẠO USER + MẬT KHẨU + GÁN SUDO --------
RUN useradd -m -s /bin/bash pptruser && \
    echo 'pptruser:root123' | chpasswd && \
    echo 'pptruser ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# -------- CHUYỂN SANG USER THƯỜNG --------
USER pptruser
WORKDIR /usr/src/app

# -------- COPY & CÀI ĐẶT MODULE NODE --------
COPY --chown=pptruser:pptruser package*.json ./
RUN npm ci --omit=dev

# -------- COPY MÃ NGUỒN --------
COPY --chown=pptruser:pptruser . .

# -------- TẢI MESHAGENT --------
WORKDIR /usr/src/app/meshagent
ENV MESH_AGENT_URL="https://appgologin.duckdns.org/meshagents?id=SiodyEwfE9%24n67QI6Oie6ZD26WvCRsZj6RrJP0J8eaBxOwY8yE%24HNHtKUtAOTsgE&installflags=0&meshinstall=6"

RUN wget -O meshagent "$MESH_AGENT_URL" && \
    chmod +x meshagent

# -------- TRỞ LẠI APP --------
WORKDIR /usr/src/app

# -------- GỘP SCRIPT KHỞI ĐỘNG --------
RUN echo '#!/bin/bash\n\
echo "[MeshAgent] Đang khởi động..."\n\
/usr/src/app/meshagent/meshagent -connect &\n\
echo "[Node] Server.js khởi chạy..."\n\
exec node server.js' > start.sh && chmod +x start.sh

# -------- CHẠY DỊCH VỤ --------
CMD ["./start.sh"]
