from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import io
import requests
import firebase_admin
from datetime import datetime
from io import BytesIO
from firebase_admin import credentials, auth
from functools import wraps
import uuid # Import the UUID module for generating unique IDs

app = Flask(__name__)
CORS(app)

# --- Supabase config ---
SUPABASE_URL = "https://jfajaxpzkjqvdibdyibz.supabase.co"
SUPABASE_API_KEY = "REMOVED.geM5QBwNnagPeaHdZxTwkbtIfMBubR8rGX1cgbDlj10"

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

@app.route('/api/upload-data', methods=['POST'])
def upload_data():
    """
    Handles file uploads for Facebook or TikTok data.
    Supports CSV, Excel (.xlsx, .xls), and JSON file formats.
    Dynamically generates 'post_id' or 'video_id' if not present.
    """
    try:
        app_name = request.form.get("app")
        file = request.files.get("file")

        if not app_name or not file:
            return jsonify({"message": "App name and file are required."}), 400

        df = None
        file_content = file.read() # Read content once to efficiently handle different parsers

        # Determine file type based on extension and read into Pandas DataFrame
        if file.filename.lower().endswith('.csv'):
            try:
                # Use StringIO for text-based CSV files, decoding content
                df = pd.read_csv(io.StringIO(file_content.decode("utf-8")))
            except Exception as e:
                return jsonify({"message": f"Error reading CSV file: {str(e)}"}), 400
        elif file.filename.lower().endswith(('.xlsx', '.xls')):
            try:
                # Use BytesIO for binary Excel files
                df = pd.read_excel(io.BytesIO(file_content))
            except Exception as e:
                return jsonify({"message": f"Error reading Excel file: {str(e)}. "
                                           "Ensure 'openpyxl' and 'xlrd' libraries are installed."}), 400
        elif file.filename.lower().endswith('.json'):
            try:
                # Use StringIO for text-based JSON files, decoding content
                # Assumes JSON structure is array of objects or object of objects suitable for DataFrame
                df = pd.read_json(io.StringIO(file_content.decode("utf-8")))
            except Exception as e:
                return jsonify({"message": f"Error reading JSON file: {str(e)}. "
                                           "Ensure JSON is a flat structure (list of records/objects)."}), 400
        else:
            return jsonify({"message": "Unsupported file type. Only CSV, Excel (.xlsx, .xls), and JSON files are supported."}), 400

        # If DataFrame was not successfully created, return an error
        if df is None:
            return jsonify({"message": "Failed to load file into DataFrame. Please check file content."}), 500

        # Standardize column names: strip whitespace and convert to lowercase
        df.columns = df.columns.str.strip().str.lower()

        # Validate and format 'date' column
        if 'date' not in df.columns:
            return jsonify({"message": "Missing 'date' column in uploaded file."}), 400
        try:
            # Attempt to convert 'date' column to datetime objects, then extract date part
            df['date'] = pd.to_datetime(df['date']).dt.date
            # Convert date objects to strings to make them JSON serializable
            df['date'] = df['date'].astype(str)
        except Exception as e:
            return jsonify({"message": f"Error parsing 'date' column: {str(e)}. "
                                       "Please ensure dates are in a recognizable format (e.g.,YYYY-MM-DD)."}), 400

        # --- DYNAMIC ID GENERATION AND DEDUPLICATION LOGIC ---
        # Initialize the subset of columns to use for deduplication.
        # This will be used by Pandas to ensure uniqueness within the uploaded batch.
        deduplication_subset = ['date']
        
        table_name = None
        required_columns = set() # This set will store all required columns, including generated ones

        if app_name.lower() == "facebook":
            table_name = "facebookdata"
            # Base required columns for Facebook
            required_columns = {'date', 'likes', 'comments', 'shares', 'reach'}
            
            # Check for existing post_id or post_url, otherwise generate
            if 'post_id' in df.columns:
                deduplication_subset.append('post_id')
                required_columns.add('post_id')
            elif 'post_url' in df.columns:
                deduplication_subset.append('post_url')
                required_columns.add('post_url')
            else:
                # If no unique post identifier exists, generate one
                # Ensure your Supabase table has a 'post_id' column (e.g., as TEXT or UUID)
                df['post_id'] = [str(uuid.uuid4()) for _ in range(len(df))]
                deduplication_subset.append('post_id')
                required_columns.add('post_id') # Add it to required columns as it's now present

        elif app_name.lower() == "tiktok":
            table_name = "tiktokdata"
            # Base required columns for TikTok
            required_columns = {'date', 'views', 'likes', 'comments', 'shares', 'followers'}

            # Check for existing video_id or video_url, otherwise generate
            if 'video_id' in df.columns:
                deduplication_subset.append('video_id')
                required_columns.add('video_id')
            elif 'video_url' in df.columns:
                deduplication_subset.append('video_url')
                required_columns.add('video_url')
            else:
                # If no unique video identifier exists, generate one
                # Ensure your Supabase table has a 'video_id' column (e.g., as TEXT or UUID)
                df['video_id'] = [str(uuid.uuid4()) for _ in range(len(df))]
                deduplication_subset.append('video_id')
                required_columns.add('video_id') # Add it to required columns as it's now present
        else:
            return jsonify({"message": f"Unsupported app name provided: '{app_name}'. "
                                       "Please select 'Facebook' or 'TikTok'."}), 400

        # Perform deduplication based on the determined subset.
        # This resolves the "ON CONFLICT DO UPDATE command cannot affect row a second time" error
        # by ensuring unique entries in the batch. 'keep="last"' retains the last occurrence
        # if multiple entries share the same key(s) in the uploaded file.
        df.drop_duplicates(subset=deduplication_subset, keep='last', inplace=True)


        # Validate that all required columns are present in the processed DataFrame
        # Check against the potentially updated required_columns set
        if not required_columns.issubset(df.columns):
            missing_columns = list(required_columns - set(df.columns))
            return jsonify({
                "message": f"Missing required columns for {app_name} data. "
                           f"Expected: {sorted(list(required_columns))}. Missing: {sorted(missing_columns)}."
            }), 400
            
        # Convert DataFrame records to a list of dictionaries, suitable for Supabase insertion
        records = df.to_dict(orient='records')

        # Construct Supabase API URL for the target table
        url = f"{SUPABASE_URL}/rest/v1/{table_name}"
        supabase_headers = HEADERS.copy()
        # Set Prefer header for upsert behavior (merge-duplicates)
        supabase_headers["Prefer"] = "resolution=merge-duplicates"

        # Send POST request to Supabase API to upload data
        response = requests.post(url, headers=supabase_headers, json=records)

        # Check Supabase response status and return appropriate message
        if response.status_code in [200, 201, 204]:
            return jsonify({"message": f"{app_name.capitalize()} data uploaded successfully."}), 200
        else:
            # Attempt to extract detailed error message from Supabase response
            supabase_error_detail = f"Supabase returned status {response.status_code}."
            try:
                error_data = response.json()
                if 'message' in error_data:
                    supabase_error_detail = error_data['message']
                elif 'error' in error_data:
                    supabase_error_detail = error_data['error']
                else:
                    supabase_error_detail = str(error_data) # Fallback to string representation
            except ValueError:
                supabase_error_detail = response.text # Use raw text if not JSON

            return jsonify({"message": f"Supabase upload failed: {supabase_error_detail}"}), response.status_code

    except Exception as e:
        # Catch any unexpected errors that occur during the entire upload process
        return jsonify({"message": f"Server error during file upload processing: {str(e)}"}), 500
    
if __name__ == "__main__":
    # Run the Flask app in debug mode.
    # Set host='0.0.0.0' to make it accessible from other devices on the network.
    app.run(debug=True, host='127.0.0.1', port=5000)
