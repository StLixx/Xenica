ARG BASE_IMAGE=docker.m.daocloud.io/library/python@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f
FROM ${BASE_IMAGE}
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY gateway.py store.py ./
CMD ["uvicorn","gateway:app","--host","0.0.0.0","--port","8891","--no-access-log"]

USER 65532:65532
