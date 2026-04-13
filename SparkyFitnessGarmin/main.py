import logging
import os
from fastapi import FastAPI
import uvicorn
from dotenv import load_dotenv  # Import load_dotenv
from routes import router as garmin_router

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()
PORT = int(os.getenv("GARMIN_SERVICE_PORT", 8000))
logger.info(f"Garmin service configured to run on port: {PORT}")

app = FastAPI()
app.include_router(garmin_router)


@app.get("/")
async def read_root():
    return {"message": "Garmin Connect Microservice is running!"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
