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

def fetch_table(table_name, select="*", order=None, limit=None):
    """
    Fetches data from a specified Supabase table.

    Args:
        table_name (str): The name of the table to fetch data from.
        select (str): The columns to select (e.g., "*", "column1,column2").
        order (str): The column to order by (e.g., "date.asc", "sales.desc").
        limit (int): The maximum number of rows to return.

    Returns:
        list: A list of dictionaries representing the fetched rows.
    """
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    params = {"select": select}
    if order:
        params["order"] = order
    if limit:
        params["limit"] = limit
    response = requests.get(url, headers=HEADERS, params=params)
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error fetching table {table_name}: {response.status_code} - {response.text}")
        return []

def fetch_summary(table_name, field="sales"):
    """
    Fetches the sum of a specific field from a Supabase table.

    Args:
        table_name (str): The name of the table.
        field (str): The field to sum (e.g., "sales", "reach").

    Returns:
        float or int: The sum of the field, or 0 if an error occurs or no data.
    """
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    # Using Supabase PostgREST's RPC style aggregate: sum of sales
    params = {
        "select": f"sum({field})"
    }
    response = requests.get(url, headers=HEADERS, params=params)
    if response.status_code == 200 and response.json():
        # Supabase usually returns [{"sum": value}] or [{"sum_field": value}]
        sum_key = next(iter(response.json()[0].keys())) # Get the key dynamically
        return response.json()[0][sum_key]
    else:
        print(f"Error fetching summary for {table_name} - {field}: {response.status_code} - {response.text}")
        return 0

def fetch_top_products(limit=5):
    """
    Fetches the top products by sales from the 'products' table.

    Args:
        limit (int): The number of top products to return.

    Returns:
        list: A list of dictionaries, each containing 'product_name' and 'sales'.
    """
    return fetch_table(
        "products",
        select="product_name,sales", # Ensure these column names match your Supabase table
        order="sales.desc",
        limit=limit
    )

@app.route('/api/tiktokdata')
def tiktok_data():
    """API endpoint to get TikTok data, ordered by date."""
    data = fetch_table("tiktokdata", order="date.asc")
    return jsonify(data)

@app.route('/api/facebookdata')
def facebook_data():
    """API endpoint to get Facebook data, ordered by date."""
    data = fetch_table("facebookdata", order="date.asc")
    return jsonify(data)

@app.route('/api/sales/summary')
def sales_summary():
    """API endpoint to get the total sales summary."""
    total_sales = fetch_summary("products", "sales")
    return jsonify({"total_sales": total_sales})

@app.route('/api/sales/top')
def sales_top():
    """API endpoint to get the top products by sales."""
    top_products = fetch_top_products()
    return jsonify(top_products)

# Initialize Firebase Admin SDK
# IMPORTANT: Ensure 'serviceAccountKey.json' path is correct for your environment.
try:
    cred = credentials.Certificate(r'C:\Users\Carlos\Documents\scape\backend\serviceAccountKey.json')
    firebase_admin.initialize_app(cred)
except Exception as e:
    print(f"Error initializing Firebase Admin SDK: {e}")
    print("Firebase features (user management) might not work correctly.")

# Decorator to require admin privileges for certain API routes
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = request.headers.get('Authorization')
        if not id_token:
            return jsonify({'error': 'Missing Authorization header'}), 401
        try:
            # Verify the Firebase ID token
            decoded_token = auth.verify_id_token(id_token)
            uid = decoded_token['uid']
            user = auth.get_user(uid)
            # Check if the user has the 'admin' custom claim set to True
            if user.custom_claims and user.custom_claims.get('admin'):
                return f(*args, **kwargs)
            else:
                return jsonify({'error': 'Admin privileges required'}), 403
        except Exception as e:
            # Handle token verification errors
            return jsonify({'error': str(e)}), 401
    return decorated_function

@app.route('/api/users', methods=['GET'])
@admin_required
def list_users():
    """API endpoint to list all Firebase users (admin only)."""
    users = []
    page = auth.list_users()
    while page:
        for user in page.users:
            users.append({
                'uid': user.uid,
                'email': user.email,
                'display_name': user.display_name,
                'custom_claims': user.custom_claims or {}
            })
        page = page.get_next_page() # Get the next batch of users
    return jsonify(users), 200

@app.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    """API endpoint to create a new Firebase user (admin only)."""
    data = request.json
    email = data.get('email')
    password = data.get('password')
    display_name = data.get('display_name')
    roles = data.get('roles', {})  # e.g. {"admin": True, "uploader": False}

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    try:
        user = auth.create_user(
            email=email,
            password=password,
            display_name=display_name
        )
        if roles:
            auth.set_custom_user_claims(user.uid, roles) # Set custom claims for roles
        return jsonify({'message': 'User created', 'uid': user.uid}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/users/<uid>', methods=['PUT'])
@admin_required
def update_user(uid):
    """API endpoint to update an existing Firebase user (admin only)."""
    data = request.json
    display_name = data.get('display_name')
    roles = data.get('roles', {})

    try:
        auth.update_user(uid, display_name=display_name)
        if roles:
            auth.set_custom_user_claims(uid, roles)
        else:
            # Remove custom claims if empty roles are provided
            auth.set_custom_user_claims(uid, None)
        return jsonify({'message': 'User updated'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/users/<uid>', methods=['DELETE'])
@admin_required
def delete_user(uid):
    """API endpoint to delete a Firebase user (admin only)."""
    id_token = request.headers.get('Authorization')
    try:
        decoded_token = auth.verify_id_token(id_token)
        current_uid = decoded_token['uid']
        if current_uid == uid:
            return jsonify({'error': 'You cannot delete your own account'}), 403 # Prevent self-deletion
        auth.delete_user(uid)
        return jsonify({'message': 'User deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == "__main__":
    # Run the Flask app in debug mode
    app.run(debug=True)
