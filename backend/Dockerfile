FROM python:3.11.8-slim-bookworm

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080

CMD ["gunicorn", "--bind", ":8080", "--workers", "1", "--threads", "8", "server:app"]