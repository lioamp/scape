from flask import Flask, jsonify
from flask_cors import CORS  # import CORS
import requests

app = Flask(__name__)
CORS(app)  # enable CORS for all routes

# Supabase project URL and API key
SUPABASE_URL = "https://jfajaxpzkjqvdibdyibz.supabase.co"
SUPABASE_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmYWpheHB6a2pxdmRpYmR5aWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4OTM0OTAsImV4cCI6MjA2MzQ2OTQ5MH0.JrTYWt8RLa5mfk4Yz6_R7ESfch1LNIRP-2be6dA7H7M"

HEADERS = {
    "apikey": SUPABASE_API_KEY,
    "Authorization": f"Bearer {SUPABASE_API_KEY}",
    "Content-Type": "application/json"
}

def fetch_table(table_name):
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    params = {"select": "*", "order": "date.asc"}  # Fix column name here
    response = requests.get(url, headers=HEADERS, params=params)
    
    print(f"Request URL: {response.url}")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")  # DEBUG

    if response.status_code == 200:
        return response.json()
    else:
        return []


@app.route('/api/tiktokdata')
def tiktok_data():
    data = fetch_table("tiktokdata")
    return jsonify(data)

@app.route('/api/facebookdata')
def facebook_data():
    data = fetch_table("facebookdata")
    return jsonify(data)

if __name__ == "__main__":
    app.run(debug=True)
