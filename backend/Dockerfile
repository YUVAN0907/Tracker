FROM python:3.11.8-slim-bookworm

WORKDIR /app

# Install dependencies from the firebase folder specifically
COPY firebase/requirements_firebase.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
# Gunicorn is needed for production WSGI hosting on Cloud Run
RUN pip install --no-cache-dir gunicorn

# Copy all the firebase folder backend files into /app
COPY firebase/ .

ENV PORT=8080

# Run the firebase_server's Flask `app` object using gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "8", "firebase_server:app"]

