from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import firebase_admin
from firebase_admin import credentials, auth
from functools import wraps

app = Flask(__name__)
CORS(app)

# --- Supabase config ---
SUPABASE_URL = "https://jfajaxpzkjqvdibdyibz.supabase.co"
SUPABASE_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmYWpheHB6a2pxdmRpYmR5aWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4OTM0OTAsImV4cCI6MjA2MzQ2OTQ5MH0.JrTYWt8RLa5mfk4Yz6_R7ESfch1LNIRP-2be6dA7H7M"

HEADERS = {
    "apikey": SUPABASE_API_KEY,
    "Authorization": f"Bearer {SUPABASE_API_KEY}",
    "Content-Type": "application/json"
}

def fetch_table(table_name):
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    params = {"select": "*", "order": "date.asc"}
    response = requests.get(url, headers=HEADERS, params=params)
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

# --- Firebase Admin Setup ---
cred = credentials.Certificate(r'C:\Users\Carlos\Documents\scape\backend\serviceAccountKey.json')
firebase_admin.initialize_app(cred)

# Decorator to require admin privileges for routes
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = request.headers.get('Authorization')
        if not id_token:
            return jsonify({'error': 'Missing Authorization header'}), 401
        try:
            decoded_token = auth.verify_id_token(id_token)
            uid = decoded_token['uid']
            user = auth.get_user(uid)
            if user.custom_claims and user.custom_claims.get('admin'):
                return f(*args, **kwargs)
            else:
                return jsonify({'error': 'Admin privileges required'}), 403
        except Exception as e:
            return jsonify({'error': str(e)}), 401
    return decorated_function

# --- Firebase User Management APIs ---

@app.route('/api/users', methods=['GET'])
@admin_required
def list_users():
    users = []
    page = auth.list_users()
    while page:
        for user in page.users:
            users.append({
                'uid': user.uid,
                'email': user.email,
                'display_name': user.display_name,
                'custom_claims': user.custom_claims
            })
        page = page.get_next_page()
    return jsonify(users), 200

@app.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    data = request.json
    try:
        user = auth.create_user(
            email=data['email'],
            password=data['password'],
            display_name=data.get('display_name', '')
        )
        if 'admin' in data:
            auth.set_custom_user_claims(user.uid, {'admin': data['admin']})
        return jsonify({'message': 'User created', 'uid': user.uid}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/users/<uid>', methods=['PUT'])
@admin_required
def update_user(uid):
    data = request.json
    try:
        auth.update_user(
            uid,
            email=data.get('email'),
            password=data.get('password'),
            display_name=data.get('display_name')
        )
        if 'admin' in data:
            auth.set_custom_user_claims(uid, {'admin': data['admin']})
        return jsonify({'message': 'User updated'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/users/<uid>', methods=['DELETE'])
@admin_required
def delete_user(uid):
    id_token = request.headers.get('Authorization')
    decoded_token = auth.verify_id_token(id_token)
    if uid == decoded_token['uid']:
        return jsonify({'error': "You cannot delete your own account"}), 400
    try:
        auth.delete_user(uid)
        return jsonify({'message': 'User deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == "__main__":
    app.run(debug=True)
