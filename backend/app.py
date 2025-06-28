from flask import Flask, jsonify, request
from flask_cors import CORS, cross_origin # Import cross_origin specifically
import pandas as pd
import io
import requests
import firebase_admin
from datetime import datetime, timedelta
from io import BytesIO
from firebase_admin import credentials, auth
from functools import wraps
import uuid
import logging
import urllib.parse
from pmdarima import auto_arima
import numpy as np
import json
from sklearn.linear_model import LinearRegression
from scipy.stats import spearmanr # Import for Spearman correlation
import os # Make sure os is imported for environment variables
from dotenv import load_dotenv
load_dotenv()


app = Flask(__name__)
CORS(app) # Apply CORS to the entire app globally

logging.basicConfig(level=logging.INFO)

# --- Supabase config ---
SUPABASE_URL = "https://jfajaxpzkjqvdibdyibz.supabase.co"
SUPABASE_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmYWpheHB6a2pxdmRpYmR5aWJ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Nzg5MzQ5MCwiZXhwIjoyMDYzNDY5NDkwfQ.geM5QBwNnagPeaHdZxTwkbtIfMBubR8rGX1cgbDlj10" # REPLACE THIS WITH YOUR ACTUAL SERVICE_ROLE KEY

HEADERS = {
    "apikey": SUPABASE_API_KEY,
    "Authorization": f"Bearer {SUPABASE_API_KEY}",
    "Content-Type": "application/json"
}

# Initialize Firebase Admin SDK
service_account_key_path = os.environ.get('FIREBASE_ADMIN_SDK_KEY_PATH')
if not service_account_key_path:
    logging.error("FIREBASE_ADMIN_SDK_KEY_PATH environment variable is not set. Firebase Admin SDK will not initialize.")
    print("CRITICAL ERROR: FIREBASE_ADMIN_SDK_KEY_PATH environment variable is not set.")
    print("Please set it to the path of your serviceAccountKey.json file.")

try:
    firebase_admin.get_app()
    logging.info("Firebase Admin SDK already initialized.")
except ValueError:
    if service_account_key_path:
        try:
            cred = credentials.Certificate(service_account_key_path)
            firebase_admin.initialize_app(cred)
            logging.info(f"Firebase Admin SDK initialized successfully from {service_account_key_path}.")
        except Exception as e:
            logging.error(f"Error initializing Firebase Admin SDK from {service_account_key_path}: {e}", exc_info=True)
            print(f"Error initializing Firebase Admin SDK: {e}")
            print("Firebase features (user management) might not work correctly. Please ensure serviceAccountKey.json is correct.")
    else:
        logging.warning("Firebase Admin SDK initialization skipped due to missing service account key path.")


def verify_token(f):
    """
    Decorator to verify Firebase ID tokens.
    Allows OPTIONS requests (preflight) to pass through without token verification.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method == 'OPTIONS':
            logging.info("OPTIONS request received, bypassing token verification.")
            return '', 204
        
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            logging.warning("Authorization token is missing from request.")
            return jsonify({"error": "Authorization token is missing."}), 401

        try:
            id_token = auth_header.split(' ')[1]
            decoded_token = auth.verify_id_token(id_token)
            request.current_user = decoded_token # Attach decoded token to request for subsequent decorators
            logging.info(f"Token verified for user: {decoded_token['uid']}")
        except Exception as e:
            logging.error(f"Error verifying token: {e}", exc_info=True)
            return jsonify({"error": "Invalid or expired token. Please log in again."}), 401
        
        # Correctly call the original function 'f'
        return f(*args, **kwargs)
    return decorated_function

# Helper to fetch data from Supabase
def fetch_table(table_name, select="*", order=None, limit=None, start_date=None, end_date=None, offset=0, count=False, filters=None):
    """
    Fetches data from a specified Supabase table with optional filters and pagination.
    This version includes logic to fetch all records if limit is None, handling Supabase's default row limit.
    
    Args:
        table_name (str): The name of the table to fetch from.
        select (str): Columns to select (e.g., "*", "id,name").
        order (str): Column to order by (e.g., "date.asc").
        limit (int): Maximum number of records to return. If None, all available records are fetched via pagination.
        start_date (str): Start date for filtering (YYYY-MM-DD).
        end_date (str): End date for filtering (YYYY-MM-DD).
        offset (int): Starting offset for pagination (used internally for fetching all).
        count (bool): If True, also return the total count of matching rows (only for the first call).
        filters (dict): Dictionary of additional filters (e.g., {"user_id": "some_uid"}).

    Returns:
        tuple or list: (records, total_count) if count=True, else just records.
    """
    all_records = []
    current_offset = offset
    supabase_page_size = 1000 # Supabase's default limit per request if not explicitly set to a lower value.

    # If a specific limit is provided, respect it and do not paginate beyond it.
    # Otherwise, we will paginate to get all data.
    effective_limit_per_request = limit if limit is not None and limit < supabase_page_size else supabase_page_size
    
    total_expected_records = float('inf') # Assume infinite until we get count from Supabase
    is_initial_call = True

    while True:
        base_url = f"{SUPABASE_URL}/rest/v1/{table_name}"
        
        query_params = []
        query_params.append(f"select={urllib.parse.quote(select)}")

        if order:
            query_params.append(f"order={urllib.parse.quote(order)}")
        
        date_column = "date"
        if table_name == "activity_logs":
            date_column = "timestamp"

        # --- Re-enabled date filters for activity_logs ---
        if start_date:
            query_params.append(f"{date_column}=gte.{urllib.parse.quote(str(start_date))}")
        if end_date:
            # For activity_logs (timestamp with time zone), ensure end_date includes the entire day
            if table_name == "activity_logs":
                # Append 'T23:59:59.999Z' to cover the whole end day in UTC
                full_end_date = f"{end_date}T23:59:59.999Z" 
                query_params.append(f"{date_column}=lte.{urllib.parse.quote(full_end_date)}")
            else:
                query_params.append(f"{date_column}=lte.{urllib.parse.quote(str(end_date))}")
        # --- End re-enabled date filters ---
        
        if filters:
            for key, value in filters.items():
                if value:
                    query_params.append(f"{key}=eq.{urllib.parse.quote(str(value))}")

        # Always explicitly set limit for each paginated request
        query_params.append(f"limit={effective_limit_per_request}")
        query_params.append(f"offset={current_offset}")

        full_url = f"{base_url}?{'&'.join(query_params)}"

        current_headers = HEADERS.copy()
        if count and is_initial_call: # Only request count on the very first call
            current_headers["Prefer"] = "count=exact"
        else:
            # Ensure Prefer header is not set to 'count=exact' for subsequent paginated calls
            # unless the original 'count' flag was true for the very first request
            if "Prefer" in current_headers and not (count and is_initial_call):
                del current_headers["Prefer"]
        
        logging.info(f"Attempting to fetch from URL: {full_url}")

        response = requests.get(full_url, headers=current_headers)
        
        logging.info(f"Response status from Supabase for {table_name}: {response.status_code}")

        # --- FIX: Accept 206 as a successful status code ---
        if response.status_code in [200, 206]:
            records = response.json()
            all_records.extend(records)

            if is_initial_call and count:
                try:
                    # Parse the total count from Content-Range header
                    content_range = response.headers.get("Content-Range", "0-*/0")
                    total_expected_records = int(content_range.split('/')[-1])
                    logging.info(f"Total count from Supabase for {table_name}: {total_expected_records}")
                except ValueError:
                    logging.warning(f"Could not parse total count from Content-Range header: {content_range}. Assuming total records based on fetched data.")
                    total_expected_records = len(records) # Fallback
            
            is_initial_call = False # No longer the initial call for subsequent paginated requests

            # If a specific limit was originally requested, and we've fetched enough, stop.
            if limit is not None and len(all_records) >= limit:
                all_records = all_records[:limit] # Truncate to the requested limit if we over-fetched
                break
            
            # Continue pagination if more data is expected or if we are fetching all (limit=None)
            # Stop if the number of records returned is less than the effective_limit_per_request
            # OR if we have fetched all_records up to the total_expected_records
            if len(records) < effective_limit_per_request or len(all_records) >= total_expected_records:
                break # No more data or fetched all required
            
            current_offset += len(records) # Increment offset by the number of records actually received
            logging.info(f"Continuing pagination for {table_name}. Next offset: {current_offset}. Current total fetched: {len(all_records)}")

        else:
            logging.error(f"Error fetching table {table_name}: {response.status_code} - {response.text}")
            if count:
                return [], 0
            return []

    if count:
        # Return the actual total records fetched, or the count from the header if it was exact.
        final_total_count = total_expected_records if total_expected_records != float('inf') else len(all_records)
        return all_records, final_total_count
    return all_records

def fetch_summary(table_name, field, start_date=None, end_date=None):
    """
    Fetches the sum of a specific field from a Supabase table with optional date filtering.
    """
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    params = {
        "select": f"sum({field})"
    }
    
    # Determine the correct date column for summary fetches
    date_column = "date"
    if table_name == "activity_logs": # Though summary usually won't apply to activity logs directly
        date_column = "timestamp"

    if start_date:
        params[f"{date_column}"] = f"gte.{urllib.parse.quote(str(start_date))}"
    if end_date:
        # For activity_logs (timestamp with time zone), ensure end_date includes the entire day
        if table_name == "activity_logs":
            # Append 'T23:59:59.999Z' to cover the whole end day in UTC
            full_end_date = f"{end_date}T23:59:59.999Z" 
            params[f"{date_column}"] = f"lte.{urllib.parse.quote(full_end_date)}"
        else:
            params[f"{date_column}"] = f"lte.{urllib.parse.quote(str(end_date))}"

    logging.info(f"Attempting to fetch summary from URL: {url} with params: {params} and headers: {HEADERS}")
    response = requests.get(url, headers=HEADERS.copy(), params=params)
    
    logging.info(f"Response status from Supabase summary for {table_name} - {field}: {response.status_code}")
    logging.info(f"Response text from Supabase summary for {table_name} - {field}: {response.text}")

    if response.status_code == 200 and response.json():
        sum_key = next(iter(response.json()[0].keys()))
        return response.json()[0][sum_key]
    else:
        logging.error(f"Error fetching summary for {table_name} - {field}: {response.status_code} - {response.text}")
        return 0

def fetch_top_products(limit=5, start_date=None, end_date=None):
    """
    Fetches the top products by sales, aggregating from the 'sales' table
    and joining with 'products' table for product names, with optional date filtering.
    """
    sales_data = fetch_table("sales", select="product_id,revenue,date", start_date=start_date, end_date=end_date) 
    
    if not sales_data:
        logging.info("No sales data available for top product calculation.")
        return []

    sales_df = pd.DataFrame(sales_data)
    sales_df['revenue'] = pd.to_numeric(sales_df['revenue'], errors='coerce').fillna(0)

    aggregated_sales = sales_df.groupby('product_id')['revenue'].sum().reset_index()
    aggregated_sales.rename(columns={'revenue': 'sales'}, inplace=True)

    products_info = fetch_table("products", select="product_id,product_name")

    if not products_info:
        logging.info("No product info available for top product calculation.")
        return []

    products_df = pd.DataFrame(products_info)

    merged_df = pd.merge(aggregated_sales, products_df, on='product_id', how='inner')

    top_products_df = merged_df.sort_values(by='sales', ascending=False).head(limit)

    return top_products_df[['product_name', 'sales']].to_dict(orient='records')


@app.route('/api/facebookdata')
@verify_token
def facebook_data():
    """API endpoint to get raw Facebook data, ordered by date."""
    # Ensure limit=None is passed so fetch_table paginates to get all data
    data = fetch_table("facebookdata", order="date.asc", limit=None)
    logging.info(f"Data fetched from Supabase for Facebook: {len(data)} records")
    return jsonify(data)

@app.route('/api/tiktokdata')
@verify_token
def tiktok_data():
    """API endpoint to get raw TikTok data, ordered by date."""
    # Ensure limit=None is passed so fetch_table paginates to get all data
    data = fetch_table("tiktokdata", order="date.asc", limit=None)
    logging.info(f"Data fetched from Supabase for TikTok: {len(data)} records")
    return jsonify(data)


@app.route('/api/salesdata')
@verify_token
def sales_data():
    """API endpoint to get Sales data, ordered by date, with optional date filtering."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    # Ensure limit=None is passed so fetch_table paginates to get all data
    data = fetch_table("sales", order="date.asc", limit=None, start_date=start_date, end_date=end_date)
    logging.info(f"Data fetched from Supabase for Sales: {len(data)} records")
    return jsonify(data)

@app.route('/api/sales/summary')
@verify_token
def sales_summary():
    """API endpoint to get the total sales summary. Currently not used by frontend for main summary."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    # fetch_summary already calls fetch_table internally with no limit, so pagination will apply
    total_sales = fetch_summary("sales", "revenue", start_date=start_date, end_date=end_date) 
    return jsonify({"total_sales": total_sales})

@app.route('/api/sales/top')
@cross_origin() # Explicitly allow CORS for this route
@verify_token
def sales_top():
    """API endpoint to get the top products by sales, with optional date filtering."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    top_products = fetch_top_products(start_date=start_date, end_date=end_date)
    return jsonify(top_products)

@app.route('/api/tiktok/reach_summary')
@verify_token
def tiktok_reach_summary():
    """API endpoint to get the total reach (views) for TikTok data. Currently not used by frontend for main summary."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    # fetch_summary already calls fetch_table internally with no limit, so pagination will apply
    total_views = fetch_summary("tiktokdata", "views", start_date=start_date, end_date=end_date)
    return jsonify({"total_tiktok_reach": total_views})

@app.route('/api/tiktok/engagement_summary')
@verify_token
def tiktok_engagement_summary():
    """API endpoint to get the total engagement (likes + comments + shares) for TikTok data. Currently not used by frontend for main summary."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    # fetch_summary already calls fetch_table internally with no limit, so pagination will apply
    total_likes = fetch_summary("tiktokdata", "likes", start_date=start_date, end_date=end_date)
    total_comments = fetch_summary("tiktokdata", "comments", start_date=start_date, end_date=end_date)
    total_shares = fetch_summary("tiktokdata", "shares", start_date=start_date, end_date=end_date)
    total_engagement = (total_likes or 0) + (total_comments or 0) + (total_shares or 0)
    return jsonify({"total_tiktok_engagement": total_engagement})


# Decorator to require admin privileges for certain API routes
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Ensure verify_token has run and populated request.current_user
        if not hasattr(request, 'current_user') or not request.current_user:
            logging.error("Admin required decorator ran without current_user set. This likely means @verify_token was not applied first.")
            return jsonify({'error': 'Authentication context missing for admin check.'}), 401

        decoded_token = request.current_user
        uid = decoded_token['uid']

        try:
            user = auth.get_user(uid)
            if user.custom_claims and user.custom_claims.get('admin'):
                return f(*args, **kwargs)
            else:
                logging.warning(f"User {uid} attempted admin access but lacks 'admin' claim. Claims: {user.custom_claims}")
                return jsonify({'error': 'Admin privileges required!'}), 403
        except Exception as e:
            logging.error(f"Error during admin claim check for user {uid}: {e}", exc_info=True)
            return jsonify({'error': f'Authorization check failed: {str(e)}'}), 401
    return decorated_function

@app.route('/api/users', methods=['GET'])
@verify_token # Added: First, verify the token
@admin_required # Second, if token is valid, check for admin claims
def list_users():
    """API endpoint to list all Firebase users (admin only)."""
    users = []
    try:
        page = auth.list_users()
        while page:
            for user in page.users:
                users.append({
                    'uid': user.uid,
                    'email': user.email,
                    'display_name': user.display_name,
                    'custom_claims': user.custom_claims or {}
                })
            page = page.get_next_page()
        return jsonify(users), 200
    except Exception as e:
        logging.error(f"Error listing users: {e}", exc_info=True)
        return jsonify({'error': f"Failed to list users: {str(e)}"}), 500


@app.route('/api/users', methods=['POST'])
@verify_token # Added: First, verify the token
@admin_required # Second, if token is valid, check for admin claims
def create_user():
    """API endpoint to create a new Firebase user (admin only)."""
    data = request.json
    email = data.get('email')
    password = data.get('password')
    display_name = data.get('display_name')
    roles = data.get('roles', {})

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    try:
        user = auth.create_user(
            email=email,
            password=password,
            display_name=display_name
        )
        if roles:
            auth.set_custom_user_claims(user.uid, roles)
        return jsonify({'message': 'User created', 'uid': user.uid}), 201
    except Exception as e:
        logging.error(f"Error creating user: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 400

@app.route('/api/users/<uid>', methods=['PUT'])
@verify_token # Added: First, verify the token
@admin_required # Second, if token is valid, check for admin claims
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
            auth.set_custom_user_claims(uid, None) # Clear claims if no roles provided
        return jsonify({'message': 'User updated'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/users/<uid>', methods=['DELETE'])
@verify_token # Added: First, verify_token
@admin_required # Second, if token is valid, check for admin claims
def delete_user(uid):
    """API endpoint to delete a Firebase user (admin only)."""
    current_uid = request.current_user['uid'] 
    try:
        if current_uid == uid:
            return jsonify({'error': 'You cannot delete your own account'}), 403
        auth.delete_user(uid)
        return jsonify({'message': 'User deleted'}), 200 
    except Exception as e:
        logging.error(f"Error deleting user {uid}: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 400

@app.route('/api/upload-data', methods=['POST'])
@verify_token # It's good practice to protect upload routes
def upload_data():
    """
    Handles file uploads for Facebook, TikTok, or Sales data.
    Supports CSV, Excel (.xlsx, .xls), and JSON file formats.
    Normalizes Sales data into 'products' and 'sales' tables.
    """
    try:
        app_name = request.form.get("app")
        file = request.files.get("file")

        if not app_name or not file:
            return jsonify({"message": "App name and file are required."}), 400

        df = None
        file_content = file.read()

        if file.filename.lower().endswith('.csv'):
            try:
                df = pd.read_csv(io.StringIO(file_content.decode("utf-8")))
            except Exception as e:
                return jsonify({"message": f"Error reading CSV file: {str(e)}"}), 400
        elif file.filename.lower().endswith(('.xlsx', '.xls')):
            try:
                df = pd.read_excel(io.BytesIO(file_content))
            except Exception as e:
                return jsonify({"message": f"Error reading Excel file: {str(e)}. "
                                         "Ensure 'openpyxl' and 'xlrd' libraries are installed."}), 400
        elif file.filename.lower().endswith('.json'):
            try:
                df = pd.read_json(io.StringIO(file_content.decode("utf-8")))
            except Exception as e:
                return jsonify({"message": f"Error reading JSON file: {str(e)}. "
                                         "Ensure JSON is a flat structure (list of records/objects)."}), 400
        else:
            return jsonify({"message": "Unsupported file type. Only CSV, Excel (.xlsx, .xls), and JSON files are supported."}), 400

        if df is None:
            return jsonify({"message": "Failed to load file into DataFrame. Please check file content."}), 500

        # Log columns immediately after initial load and normalization
        logging.info(f"DataFrame columns after initial load and normalization: {df.columns.tolist()}")

        df.columns = df.columns.str.strip().str.lower()

        if 'date' in df.columns:
            try:
                df['date'] = pd.to_datetime(df['date']).dt.date
                df['date'] = df['date'].astype(str)
            except Exception as e:
                return jsonify({"message": f"Error parsing 'date' column: {str(e)}. "
                                         "Please ensure dates are in a recognizable format (e.g.,YYYY-MM-DD)."}), 400
        
        target_tables = {}
        if app_name.lower() == "facebook":
            table_name = "facebookdata"
            required_columns = {'date', 'likes', 'comments', 'shares', 'reach'}
            
            logging.info(f"Facebook: DataFrame head before specific processing: {df.head().to_dict(orient='records')}")

            if not required_columns.issubset(df.columns):
                missing_cols = list(required_columns - set(df.columns))
                return jsonify({"message": f"Missing required Facebook columns: {', '.join(missing_cols)}. Expected: {', '.join(sorted(list(required_columns)))}"}), 400

            if 'post_id' in df.columns:
                required_columns.add('post_id')
            elif 'post_url' in df.columns:
                required_columns.add('post_url')
            else:
                df['post_id'] = [str(uuid.uuid4()) for _ in range(len(df))]
                required_columns.add('post_id')
            
            deduplication_subset = ['date']
            if 'post_id' in df.columns:
                deduplication_subset.append('post_id')
            elif 'post_url' in df.columns:
                deduplication_subset.append('post_url')
            
            for col in ['likes', 'comments', 'shares', 'reach']:
                if col in df.columns:
                    if not pd.api.types.is_numeric_dtype(df[col]):
                        non_numeric = df[pd.to_numeric(df[col], errors='coerce').isna()][col].head(5).tolist()
                        if non_numeric:
                            logging.warning(f"Facebook: Column '{col}' contains non-numeric data. Examples: {non_numeric}")
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
                    logging.info(f"Facebook: Column '{col}' after numeric conversion (first 5 values): {df[col].head(5).tolist()}")


            df.drop_duplicates(subset=deduplication_subset, keep='last', inplace=True)

            df_to_upload = df[list(required_columns)]
            records = df_to_upload.to_dict(orient='records')
            logging.info(f"Facebook data prepared for upload (final records to Supabase): {records}") # Debug log
            target_tables = {table_name: records}

        elif app_name.lower() == "tiktok":
            table_name = "tiktokdata"
            required_columns = {'date', 'views', 'likes', 'comments', 'shares'}
            
            logging.info(f"TikTok: DataFrame head before specific processing: {df.head().to_dict(orient='records')}")

            if not required_columns.issubset(df.columns):
                missing_cols = list(required_columns - set(df.columns))
                return jsonify({"message": f"Missing required TikTok columns: {', '.join(missing_cols)}. Expected: {', '.join(sorted(list(required_columns)))}"}), 400

            for col in ['views', 'likes', 'comments', 'shares']:
                if col in df.columns:
                    if not pd.api.types.is_numeric_dtype(df[col]):
                        non_numeric = df[pd.to_numeric(df[col], errors='coerce').isna()][col].head(5).tolist()
                        if non_numeric:
                            logging.warning(f"TikTok: Column '{col}' contains non-numeric data. Examples: {non_numeric}")
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
                    logging.info(f"TikTok: Column '{col}' after numeric conversion (first 5 values): {df[col].head(5).tolist()}")


            df = df.groupby('date').agg(
                views=('views', 'sum'),
                likes=('likes', 'sum'),
                comments=('comments', 'sum'),
                shares=('shares', 'sum')
            ).reset_index()

            for col in ['views', 'likes', 'comments', 'shares']:
                if col not in df.columns:
                    df[col] = 0

            df_to_upload = df[list(required_columns)]
            records = df_to_upload.to_dict(orient='records')
            logging.info(f"TikTok data prepared for upload (final records to Supabase): {records}") # Debug log
            target_tables = {table_name: records}

        elif app_name.lower() == "sales": 
            products_table_name = "products"
            sales_table_name = "sales"

            required_sales_columns = {'date', 'product id', 'product name', 'quantity sold', 'price', 'revenue'}
            
            if not required_sales_columns.issubset(df.columns):
                missing_columns = list(required_sales_columns - set(df.columns))
                return jsonify({
                    "message": f"Missing required columns for Sales data. "
                               f"Expected: {sorted(list(required_sales_columns))}. Missing: {sorted(missing_columns)}."
                }), 400

            df.rename(columns={
                'product id': 'product_id',
                'product name': 'product_name',
                'quantity sold': 'quantity',
                'price': 'price_per_unit'
            }, inplace=True)

            for col in ['quantity', 'price_per_unit', 'revenue']:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0) 

            if 'revenue' in df.columns:
                df['total_price'] = df['revenue']
            else:
                df['total_price'] = df['quantity'] * df['price_per_unit']

            if 'product_id' in df.columns:
                products_df = df[['product_id', 'product_name']].drop_duplicates().copy()
                products_df['product_id'] = products_df['product_id'].astype(str)
            else:
                unique_products = df[['product_name']].drop_duplicates().copy()
                unique_products['product_id'] = [str(uuid.uuid4()) for _ in range(len(unique_products))]
                
                df = pd.merge(df, unique_products, on='product_name', how='left')

                products_df = unique_products

            products_records = products_df[['product_id', 'product_name']].to_dict(orient='records')
            logging.info(f"Products records for upload: {products_records}")

            sales_df = df.copy()
            sales_df['sale_id'] = [str(uuid.uuid4()) for _ in range(len(sales_df))]

            if 'product_id' not in sales_df.columns:
                return jsonify({"message": "Internal error: product_id not generated/mapped for sales data."}), 500

            sales_records = sales_df.rename(columns={
                'price_per_unit': 'price',
                'total_price': 'revenue',
                'quantity': 'quantity_sold'
            })[[
                'sale_id', 'product_id', 'date', 'quantity_sold', 'price', 'revenue'
            ]].to_dict(orient='records')
            logging.info(f"Sales records for upload: {sales_records}")

            target_tables = {
                products_table_name: products_records,
                sales_table_name: sales_records
            }

        else:
            return jsonify({"message": f"Unsupported app name provided: '{app_name}'. "
                                      "Please select 'Facebook', 'TikTok', or 'Sales'."}), 400

        upload_messages = []
        for tbl_name, records in target_tables.items():
            if not records:
                upload_messages.append(f"No data to upload for table: {tbl_name}.")
                continue

            url = f"{SUPABASE_URL}/rest/v1/{tbl_name}"
            supabase_headers = HEADERS.copy()
            
            if tbl_name == "products":
                supabase_headers["Prefer"] = "resolution=merge-duplicates"
            else:
                if "Prefer" in supabase_headers:
                    del supabase_headers["Prefer"]

            logging.info(f"Attempting to upload to {tbl_name} with {len(records)} records.")
            response = requests.post(url, headers=supabase_headers, json=records)

            if response.status_code in [200, 201, 204]:
                upload_messages.append(f"'{tbl_name}' data uploaded successfully.")
            else:
                supabase_error_detail = f"Supabase returned status {response.status_code}."
                try:
                    error_data = response.json()
                    if 'message' in error_data:
                        supabase_error_detail = error_data['message']
                    elif 'error' in error_data:
                        supabase_error_detail = error_data['error']
                    else:
                        supabase_error_detail = str(error_data)
                except ValueError:
                    supabase_error_detail = response.text
                
                upload_messages.append(f"'{tbl_name}' upload failed: {supabase_error_detail}")
                return jsonify({"message": "; ".join(upload_messages)}), response.status_code

        return jsonify({"message": "; ".join(upload_messages)}), 200

    except Exception as e:
        return jsonify({"message": f"Server error during file upload processing: {str(e)}"}), 500

# NEW API ENDPOINT FOR PERFORMANCE DATA
@app.route('/api/performance-data', methods=['GET'])
@verify_token
def performance_data():
    """
    API endpoint for aggregated historical performance data for charts (not predictive).
    Fetches historical data for engagement, reach, and aggregates them dynamically
    (daily, weekly, or monthly) based on the date range, and filters by platform.
    """
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    platform_filter = request.args.get('platform', 'all')

    try:
        # Convert date strings to datetime objects to calculate date range difference
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d') if start_date_str else None
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d') if end_date_str else None

        # Determine resampling frequency based on date range
        freq = 'MS' # Default to Month Start
        date_format = '%Y-%m-%d' # Default date format for output, will be adjusted
        
        if start_date and end_date:
            delta = end_date - start_date
            if delta <= timedelta(days=30): # Up to 30 days, show daily
                freq = 'D'
                date_format = '%Y-%m-%d'
            elif delta <= timedelta(days=90): # 31 to 90 days, show weekly
                freq = 'W'
                date_format = '%Y-%m-%d' # Keep full date for weekly points, frontend can format to 'Week X, YY-MM-DD'
            else: # More than 90 days, show monthly
                freq = 'MS'
                date_format = '%Y-%m' # Format to Year-Month for monthly aggregation
        
        logging.info(f"Calculated frequency for performance data: {freq} with date format: {date_format}")

        # Fetch data based on filters
        # IMPORTANT: fetch_table now handles pagination internally when limit is None
        tiktok_records = fetch_table("tiktokdata", select="date,views,likes,comments,shares",
                                     start_date=start_date_str, end_date=end_date_str, limit=None)
        facebook_records = fetch_table("facebookdata", select="date,likes,comments,shares,reach",
                                       start_date=start_date_str, end_date=end_date_str, limit=None)
        sales_records = fetch_table("sales", select="date,revenue",
                                    start_date=start_date_str, end_date=end_date_str, limit=None)


        df_tiktok = pd.DataFrame(tiktok_records)
        df_facebook = pd.DataFrame(facebook_records)
        df_sales = pd.DataFrame(sales_records)


        # Process social media data for Engagement and Reach charts
        combined_social_df = pd.DataFrame()
        
        if not df_tiktok.empty:
            df_tiktok['date'] = pd.to_datetime(df_tiktok['date'], errors='coerce')
            # Filter by platform here
            if platform_filter == 'all' or platform_filter == 'tiktok':
                df_tiktok['engagement_raw'] = df_tiktok['likes'].fillna(0) + df_tiktok['comments'].fillna(0) + df_tiktok['shares'].fillna(0)
                df_tiktok['reach_raw'] = df_tiktok['views'].fillna(0)
                combined_social_df = pd.concat([combined_social_df, df_tiktok[['date', 'engagement_raw', 'reach_raw']]])
        
        if not df_facebook.empty:
            df_facebook['date'] = pd.to_datetime(df_facebook['date'], errors='coerce')
            # Filter by platform here
            if platform_filter == 'all' or platform_filter == 'facebook':
                df_facebook['engagement_raw'] = df_facebook['likes'].fillna(0) + df_facebook['comments'].fillna(0) + df_facebook['shares'].fillna(0)
                df_facebook['reach_raw'] = df_facebook['reach'].fillna(0)
                combined_social_df = pd.concat([combined_social_df, df_facebook[['date', 'engagement_raw', 'reach_raw']]])

        # Aggregate combined social media data dynamically
        if not combined_social_df.empty:
            combined_social_df = combined_social_df.dropna(subset=['date'])
            combined_social_df.set_index('date', inplace=True)
            
            # Aggregate raw engagement and reach totals per selected frequency
            aggregated_social_data = combined_social_df.resample(freq).agg({
                'engagement_raw': 'sum',
                'reach_raw': 'sum'
            }).reset_index()
            
            aggregated_social_data.rename(columns={
                'engagement_raw': 'engagement_total', # Keep raw total for frontend calculation
                'reach_raw': 'reach_total' # Keep raw total for frontend calculation
            }, inplace=True)
            
            # Calculate Engagement Rate: (engagement_total / reach_total) * 100%
            # This 'engagement' column is the percentage for the aggregated period.
            aggregated_social_data['engagement'] = aggregated_social_data.apply(
                lambda row: (row['engagement_total'] / row['reach_total']) * 100 if row['reach_total'] > 0 else 0, axis=1
            )
            aggregated_social_data['engagement'] = aggregated_social_data['engagement'].round(2) # Round to 2 decimal places

            # Format date column according to chosen frequency
            aggregated_social_data['date'] = aggregated_social_data['date'].dt.strftime(date_format)
        else:
            aggregated_social_data = pd.DataFrame(columns=['date', 'engagement_total', 'reach_total', 'engagement'])

        # Process Sales data for charting
        aggregated_sales_data_for_charts = pd.DataFrame(columns=['date', 'sales_total'])
        total_sales = 0 # Initialize total_sales here
        if not df_sales.empty:
            df_sales['date'] = pd.to_datetime(df_sales['date'], errors='coerce')
            df_sales = df_sales.dropna(subset=['date'])
            df_sales['revenue'] = pd.to_numeric(df_sales['revenue'], errors='coerce').fillna(0)
            df_sales.set_index('date', inplace=True)
            
            # Aggregate sales data by the determined frequency
            aggregated_sales_data_for_charts = df_sales.resample(freq).agg({
                'revenue': 'sum'
            }).reset_index()
            aggregated_sales_data_for_charts.rename(columns={'revenue': 'sales_total'}, inplace=True)
            
            # Format date column for sales charts
            aggregated_sales_data_for_charts['date'] = aggregated_sales_data_for_charts['date'].dt.strftime(date_format)
            aggregated_sales_data_for_charts.sort_values(by='date', inplace=True)

            # Calculate total sales from the aggregated data (or directly from df_sales)
            total_sales = df_sales['revenue'].sum() # Sum all revenue for the total summary
        
        # Format for frontend - select all necessary columns for social media performance
        performance_charts_data = aggregated_social_data[['date', 'engagement', 'engagement_total', 'reach_total']].to_dict(orient='records')
        performance_charts_data.sort(key=lambda x: x['date']) # Ensure sorted by date

        return jsonify({
            "performance_charts_data": performance_charts_data, # Social media charts data
            "sales_charts_data": aggregated_sales_data_for_charts.to_dict(orient='records'), # Aggregated sales data for charts
            "total_sales_summary": total_sales # Include total sales summary here
        })

    except Exception as e:
        logging.error(f"Server error during performance data retrieval: {e}", exc_info=True)
        return jsonify({"error": f"An error occurred during performance data retrieval: {str(e)}"}), 500


def perform_arima_forecast(series, forecast_periods):
    """
    Performs ARIMA forecasting on a given time series.
    Returns forecasted values, lower bounds, upper bounds, and the actual last historical year.
    """
    logging.info(f"Attempting ARIMA forecast for {len(series)} data points.")
    
    # Ensure there's at least one data point to determine the last historical year,
    # even if ARIMA can't run.
    last_historical_year = series.index.max().year if not series.empty else None

    # Check for minimum data points for ARIMA
    # pmdarima's auto_arima generally needs at least 5 data points (years) for meaningful results.
    # If less than 2, perform_linear_regression_forecast will also warn.
    if len(series) < 5: 
        logging.warning(f"Insufficient data ({len(series)} points) for robust ARIMA. Falling back to Linear Regression.")
        # Pass the original series to linear regression for it to handle its own data requirements
        return perform_linear_regression_forecast(series, forecast_periods), last_historical_year
    
    try:
        # Fit auto_arima model
        # Using suppress_warnings=True to avoid printing convergence warnings to console
        model = auto_arima(series, seasonal=False, suppress_warnings=True,
                           error_action="ignore", trace=False, stepwise=True)
        
        # Make predictions including confidence intervals
        forecast, conf_int = model.predict(n_periods=forecast_periods, return_conf_int=True)

        forecast_results = []
        last_historical_year_dt = series.index.max() # This is a pandas Timestamp/DatetimeIndex value
        
        for i in range(forecast_periods):
            # Explicitly add a YearEnd frequency to get the correct future year's end
            forecast_year_dt = last_historical_year_dt + pd.offsets.YearEnd(i + 1) 
            
            # Ensure predicted values are not negative for engagement/reach type metrics
            predicted_value = round(float(forecast.iloc[i]), 2)
            lower_bound = round(float(conf_int[i][0]), 2)
            upper_bound = round(float(conf_int[i][1]), 2)

            # Enforce non-negativity for appropriate metrics
            # This is a heuristic to prevent negative predictions for metrics that shouldn't be negative.
            # You might need to adjust this based on the specific behavior of your data and models.
            if predicted_value < 0:
                predicted_value = 0
            if lower_bound < 0:
                lower_bound = 0
            # Upper bound can sometimes be negative if the lower bound is strongly negative and range is small
            # but usually it should be positive if predicted_value is positive.
            # For simplicity, we ensure lower_bound and predicted_value are non-negative.

            forecast_results.append({
                "year": int(forecast_year_dt.year), # Get the year as an integer
                "value": predicted_value,
                "lower_bound": lower_bound,
                "upper_bound": upper_bound
            })
        logging.info(f"ARIMA forecast results: {forecast_results}")
        return forecast_results, last_historical_year_dt.year

    except Exception as e:
        logging.error(f"Error during ARIMA forecast: {e}", exc_info=True)
        logging.warning("ARIMA failed. Falling back to Linear Regression.")
        # Ensure that when falling back, it still returns the last historical year as an integer
        return perform_linear_regression_forecast(series, forecast_periods), last_historical_year

def perform_linear_regression_forecast(series, forecast_periods):
    """
    Performs Linear Regression forecasting as a fallback.
    Returns forecasted values, assuming no confidence intervals for simplicity.
    """
    logging.info(f"Performing Linear Regression forecast for {len(series)} data points.")
    if len(series) < 2: # Need at least two points for a line
        logging.warning("Not enough data for Linear Regression. Returning empty forecast.")
        return []

    # Prepare data for Linear Regression
    # Use the 'year' part of the DatetimeIndex for X
    X = np.array([dt.year for dt in series.index]).reshape(-1, 1) 
    y = series.values # Metric values

    model = LinearRegression()
    model.fit(X, y)

    last_historical_year = series.index.max().year
    # Generate future years as integers for prediction
    forecast_years_int = np.array([last_historical_year + 1 + i for i in range(forecast_periods)]).reshape(-1, 1)
    
    forecast_values = model.predict(forecast_years_int)

    forecast_results = []
    for i in range(forecast_periods):
        predicted_value = round(float(forecast_values[i]), 2)
        
        # Enforce non-negativity for appropriate metrics
        if predicted_value < 0:
            predicted_value = 0

        # Simple proxy for CI, also ensuring non-negativity
        lower_bound = round(float(predicted_value * 0.9), 2) 
        upper_bound = round(float(predicted_value * 1.1), 2)  
        
        if lower_bound < 0:
            lower_bound = 0

        forecast_results.append({
            "year": int(forecast_years_int[i][0]), # Use the integer year directly
            "value": predicted_value,
            "lower_bound": lower_bound,
            "upper_bound": upper_bound
        })
    logging.info(f"Linear Regression forecast results: {forecast_results}")
    return forecast_results

def generate_recommendation(historical_series, forecast_results, metric_name):
    """
    Generates a recommendation based on historical and forecasted trends.
    """
    if not historical_series.empty and forecast_results:
        last_historical_value = historical_series.iloc[-1]
        forecast_value_next_year = forecast_results[0]['value'] if forecast_results else last_historical_value

        # Calculate historical trend (e.g., last 3 years average change)
        if len(historical_series) >= 3:
            recent_historical_trend = (historical_series.iloc[-1] - historical_series.iloc[-3]) / 2
        else:
            recent_historical_trend = 0 # No significant trend to calculate

        # Compare next year's forecast to last historical value
        change_percent = ((forecast_value_next_year - last_historical_value) / last_historical_value) * 100 if last_historical_value != 0 else 0

        recommendation = f"Based on historical data and projected trends, your {metric_name} is forecasted to be around {forecast_value_next_year:,.0f} next year."

        if change_percent > 5:
            recommendation += " This indicates a strong positive growth. Consider investing more in strategies that have driven this success."
        elif change_percent < -5:
            recommendation += " This suggests a potential decline . It's crucial to analyze recent activities and re-evaluate your strategy to mitigate this trend."
        else:
            recommendation += " This indicates a stable trend. Continue optimizing current efforts and explore new avenues for growth."
        
        return recommendation
    else:
        return f"Not enough data to provide a comprehensive recommendation for {metric_name}. Please upload more historical data."

@app.route('/api/predictive-analytics', methods=['GET'])
@verify_token
def predictive_analytics():
    """
    API endpoint for predictive analytics.
    Fetches historical data, performs forecasting (ARIMA or Linear Regression fallback),
    and generates recommendations.
    """
    metric_type = request.args.get('metric_type')
    if not metric_type:
        return jsonify({"error": "Metric type is required (e.g., 'sales', 'engagement', 'reach')."}), 400

    metric_name = ""
    
    try:
        if metric_type == 'sales':
            metric_name = "Sales Revenue"
            # Ensure limit=None is passed so fetch_table paginates to get all data
            sales_records = fetch_table("sales", select="date,revenue", order="date.asc", limit=None)
            df = pd.DataFrame(sales_records)
            # Check if 'date' column exists before processing
            if 'date' not in df.columns:
                return jsonify({"error": f"Missing 'date' column in sales data for {metric_type}. Please check your uploaded sales data for a 'date' column."}), 400
            df['date'] = pd.to_datetime(df['date'], errors='coerce') # Coerce errors will turn invalid dates into NaT
            df = df.dropna(subset=['date']) # Drop rows where date parsing failed
            df['revenue'] = pd.to_numeric(df['revenue'], errors='coerce').fillna(0)
            df = df.set_index('date')
            historical_series = df['revenue']

        elif metric_type == 'engagement' or metric_type == 'reach':
            metric_name = "Engagement" if metric_type == 'engagement' else "Reach"
            
            # Ensure limit=None is passed so fetch_table paginates to get all data
            tiktok_records = fetch_table("tiktokdata", select="date,views,likes,comments,shares", order="date.asc", limit=None)
            facebook_records = fetch_table("facebookdata", select="date,likes,comments,shares,reach", order="date.asc", limit=None)
            
            combined_data = []
            
            # Include TikTok data
            for item in tiktok_records:
                # Ensure 'date' exists in item before trying to access
                if 'date' in item:
                    combined_data.append({
                        "date": item.get('date'),
                        "likes": item.get('likes', 0),
                        "comments": item.get('comments', 0),
                        "shares": item.get('shares', 0),
                        "views": item.get('views', 0) # TikTok uses 'views'
                    })
                else:
                    logging.warning(f"TikTok record missing 'date' key: {item}")
            
            for item in facebook_records:
                # Ensure 'date' exists in item before trying to access
                if 'date' in item:
                    combined_data.append({
                        "date": item.get('date'),
                        "likes": item.get('likes', 0),
                        "comments": item.get('comments', 0),
                        "shares": item.get('shares', 0),
                        "views": item.get('reach', 0) # Facebook uses 'reach'
                    })
                else:
                    logging.warning(f"Facebook record missing 'date' key: {item}")


            df = pd.DataFrame(combined_data)
            # Check if 'date' column exists after combining data before processing
            if 'date' not in df.columns:
                return jsonify({"error": f"Missing 'date' column in combined data for {metric_type}. Please check your uploaded TikTok and Facebook data for a 'date' column."}), 400
            df['date'] = pd.to_datetime(df['date'], errors='coerce') # Coerce errors will turn invalid dates into NaT
            df = df.dropna(subset=['date']) # Drop rows where date parsing failed
            
            if metric_type == 'engagement':
                df['value'] = pd.to_numeric(df['likes'], errors='coerce').fillna(0) + \
                              pd.to_numeric(df['comments'], errors='coerce').fillna(0) + \
                              pd.to_numeric(df['shares'], errors='coerce').fillna(0)
            else: # metric_type == 'reach'
                df['value'] = pd.to_numeric(df['views'], errors='coerce').fillna(0)
            
            df = df.set_index('date')
            historical_series = df['value']

        else:
            return jsonify({"error": "Unsupported metric type."}), 400

        # Resample to annual data. If a year has no data, it will be NaN.
        historical_series_annual = historical_series.resample('YE').sum() 
        logging.info(f"Initial annual historical series before dropping NaNs:\n{historical_series_annual}")
        
        # --- LOGIC TO Exclude INCOMPLETE current year data from historical for forecasting ---
        current_calendar_date = datetime.now()
        current_calendar_year = current_calendar_date.year

        # Determine the cutoff year for historical data to be used in the model.
        # If the current calendar month is NOT December, then the current calendar year's
        # data is inherently incomplete for annual aggregation purposes.
        if current_calendar_date.month < 12: # Check if current month is less than December
            last_complete_historical_year_for_model = current_calendar_year - 1
            logging.info(f"Current calendar year {current_calendar_year} is incomplete (month is {current_calendar_date.month}). "
                         f"Historical data for model training will end at {last_complete_historical_year_for_model}.")
        else:
            # If it's December, the current year is considered complete for now.
            last_complete_historical_year_for_model = current_calendar_year
            logging.info(f"Current calendar year {current_calendar_year} is complete (month is {current_calendar_date.month}). "
                         f"Historical data for model training will end at {last_complete_historical_year_for_model}.")

        # Filter the annually resampled series to only include years up to last_complete_historical_year_for_model.
        # Drop NaNs *after* this filtering to ensure we only have data for years we intend to include.
        historical_series_for_forecast = historical_series_annual[historical_series_annual.index.year <= last_complete_historical_year_for_model].dropna()

        logging.info(f"Historical series FOR FORECASTING MODEL (after filtering for complete years):\n{historical_series_for_forecast}")

        # Ensure we still have enough data after filtering for complete years
        if historical_series_for_forecast.empty or len(historical_series_for_forecast) < 2:
            return jsonify({
                "historical_data": [], # No historical data for plot if filtered too much
                "forecast_data": [],
                "recommendation": f"Not enough *complete* historical data (at least 2 full years) to generate a forecast for {metric_name}. Please upload more complete historical data.",
                "message": "Not enough complete historical data for forecasting."
            }), 200
        # --- END LOGIC ---

        last_historical_year_for_forecast_model = historical_series_for_forecast.index.max().year 
        
        # Fixed forecast periods to 3 years
        forecast_periods = 3 

        logging.info(f"Forecasting {forecast_periods} periods starting from {last_historical_year_for_forecast_model + 1}.")

        # Use ARIMA for all forecasts (with Linear Regression fallback inside perform_arima_forecast)
        forecast_results, _ = perform_arima_forecast(historical_series_for_forecast, forecast_periods)
        
        # Ensure that the years in forecast_results align with the intended future sequence.
        # This handles cases where models might return different indices.
        if forecast_results:
            # Reassign years to be consecutive starting from last_historical_year_for_forecast_model + 1
            for i in range(len(forecast_results)):
                forecast_results[i]['year'] = last_historical_year_for_forecast_model + 1 + i


        # Generate recommendation
        recommendation = generate_recommendation(historical_series_for_forecast, forecast_results, metric_name)

        # Format historical data for frontend plotting (using the filtered series)
        historical_formatted = []
        for year_dt, value in historical_series_for_forecast.items():
            historical_formatted.append({
                'year': year_dt.year,
                'value': round(float(value), 2)
            })
        # Ensure historical data is sorted by year
        historical_formatted.sort(key=lambda x: x['year'])

        return jsonify({
            "historical_data": historical_formatted,
            "forecast_data": forecast_results,
            "recommendation": recommendation,
            "message": "Predictive analytics successful."
        })

    except Exception as e:
        logging.error(f"Server error during predictive analytics for {metric_type}: {e}", exc_info=True)
        return jsonify({"error": f"An error occurred during predictive analytics for {metric_name}: {str(e)}"}), 500

@app.route('/api/correlation-analysis', methods=['GET'])
@verify_token
def correlation_analysis():
    """
    API endpoint for Spearman's Rank Correlation analysis.
    Calculates correlations between Engagement, Reach, and Sales.
    Provides automated recommendations based on correlation strength.
    Also returns the underlying data for scatter plotting.
    Filters data by platform.
    """
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    platform_filter = request.args.get('platform', 'all') # Get platform filter

    # Fetch data from all relevant tables
    # IMPORTANT: fetch_table now handles pagination internally when limit is None
    tiktok_records = fetch_table("tiktokdata", select="date,views,likes,comments,shares", start_date=start_date_str, end_date=end_date_str, limit=None)
    facebook_records = fetch_table("facebookdata", select="date,likes,comments,shares,reach", start_date=start_date_str, end_date=end_date_str, limit=None)
    sales_records = fetch_table("sales", select="date,revenue", start_date=start_date_str, end_date=end_date_str, limit=None)

    # Prepare dataframes
    df_tiktok = pd.DataFrame(tiktok_records)
    df_facebook = pd.DataFrame(facebook_records)
    df_sales = pd.DataFrame(sales_records)

    # Convert 'date' columns to datetime and set as index for all DFs
    for df in [df_tiktok, df_facebook, df_sales]:
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'], errors='coerce')
            df.set_index('date', inplace=True)
        else:
            logging.warning(f"DataFrame is missing 'date' column.")
            continue
    
    # Aggregate social media data based on platform filter
    combined_social_df = pd.DataFrame()
    
    if not df_tiktok.empty and (platform_filter == 'all' or platform_filter == 'tiktok'):
        df_tiktok['engagement'] = df_tiktok['likes'].fillna(0) + df_tiktok['comments'].fillna(0) + df_tiktok['shares'].fillna(0)
        df_tiktok['reach'] = df_tiktok['views'].fillna(0)
        tiktok_daily_agg = df_tiktok.groupby(df_tiktok.index).agg({'engagement': 'sum', 'reach': 'sum'})
        combined_social_df = pd.concat([combined_social_df, tiktok_daily_agg])

    if not df_facebook.empty and (platform_filter == 'all' or platform_filter == 'facebook'):
        df_facebook['engagement'] = df_facebook['likes'].fillna(0) + df_facebook['comments'].fillna(0) + df_facebook['shares'].fillna(0)
        df_facebook['reach'] = df_facebook['reach'].fillna(0)
        facebook_daily_agg = df_facebook.groupby(df_facebook.index).agg({'engagement': 'sum', 'reach': 'sum'})
        combined_social_df = pd.concat([combined_social_df, facebook_daily_agg])

    # If both DFs contributed, re-aggregate to ensure unique daily sums (after platform filtering)
    if not combined_social_df.empty:
        combined_social_df = combined_social_df.groupby(combined_social_df.index).agg({'engagement': 'sum', 'reach': 'sum'})
    else:
        # If no data after filtering, initialize with empty columns to avoid key errors later
        combined_social_df = pd.DataFrame(columns=['engagement', 'reach'])


    # Aggregate sales data
    if not df_sales.empty:
        df_sales['revenue'] = df_sales['revenue'].fillna(0)
        sales_daily_agg = df_sales.groupby(df_sales.index).agg({'revenue': 'sum'})
    else:
        sales_daily_agg = pd.DataFrame(columns=['revenue'])

    # Merge aggregated dataframes on date
    # Use outer join to keep all dates from social or sales data, then filter for common dates later for correlation
    merged_df = pd.merge(combined_social_df, sales_daily_agg, left_index=True, right_index=True, how='outer')
    merged_df = merged_df.fillna(0) # Fill any remaining NaNs with 0

    # For correlation calculation, we need common data points.
    # Filter for rows where all relevant columns ('engagement', 'reach', 'revenue') have data (not zero after fillna).
    # This specifically addresses the 'insufficient data' for correlation, while still providing `chart_data` for plotting what's available.
    correlation_df = merged_df[(merged_df['engagement'] > 0) & (merged_df['reach'] > 0) & (merged_df['revenue'] > 0)].copy()

    # Prepare data for scatter plots (from the full merged_df, which includes dates with zeros after fillna)
    chart_data = []
    if not merged_df.empty:
        merged_df_sorted = merged_df.sort_index() # Ensure data is sorted by date
        for index, row in merged_df_sorted.iterrows():
            chart_data.append({
                'date': index.strftime('%Y-%m-%d'), # Format date for Chart.js
                'engagement': row.get('engagement', 0),
                'reach': row.get('reach', 0),
                'sales': row.get('revenue', 0)
            })

    correlations = {}
    recommendations = {}

    def get_recommendation_text(correlation, var1_name, var2_name):
        if pd.isna(correlation):
            return f"Not enough data to calculate a meaningful correlation between {var1_name} and {var2_name} for the selected period/platform."
        
        correlation_abs = abs(correlation)
        if correlation_abs >= 0.7:
            strength = "strong"
            action = "significantly"
        elif correlation_abs >= 0.3:
            strength = "moderate"
            action = "tend to"
        else:
            strength = "weak or negligible"
            action = "do not significantly"

        if correlation > 0.3:
            direction = "positive"
            message = f"There is a {strength} {direction} correlation between {var1_name} and {var2_name} (Correlation: {correlation:.2f}). This suggests that as {var1_name} increases, {var2_name} {action} increase. Consider optimizing strategies that synergistically boost both."
        elif correlation < -0.3:
            direction = "negative"
            message = f"There is a {strength} {direction} correlation between {var1_name} and {var2_name} (Correlation: {correlation:.2f}). This indicates that as {var1_name} increases, {var2_name} {action} decrease. You should investigate potential conflicts or inverse relationships and adjust your campaign strategy accordingly."
        else:
            message = f"There is a {strength} correlation between {var1_name} and {var2_name} (Correlation: {correlation:.2f}). This suggests that changes in {var1_name} {action} influence {var2_name} in a direct or inverse manner. It might be beneficial to explore other factors or refine your approach."
        return message

    # Check if there's enough data in the *correlation_df* for calculation
    min_data_points = 5 # A reasonable minimum for meaningful correlation analysis
    if len(correlation_df) < min_data_points:
        logging.warning(f"Insufficient common data points for correlation analysis: {len(correlation_df)} found, {min_data_points} required.")
        return jsonify({
            "message": f"Not enough common data points ({len(correlation_df)} found, {min_data_points} required) "
                       "across all metrics with non-zero values for correlation analysis within the selected date range and platform. "
                       "Please adjust your date range, platform filter, or upload more data.",
            "correlations": {
                "engage_reach": None,
                "engage_sales": None,
                "reach_sales": None
            },
            "recommendations": {
                "engage_reach": "Insufficient data to provide a recommendation for Engagement/Reach correlation.",
                "engage_sales": "Insufficient data to provide a recommendation for Engagement/Sales correlation.",
                "reach_sales": "Insufficient data to provide a recommendation for Reach/Sales correlation."
            },
            "chart_data": chart_data # Still return available data for plotting
        }), 200

    # Calculate correlations and generate recommendations using correlation_df
    # Note: spearmanr handles NaN by dropping them, but we've already filled with 0.
    # It's important that the series used for spearmanr has variance.
    
    if 'engagement' in correlation_df.columns and 'reach' in correlation_df.columns and \
       correlation_df['engagement'].std() > 0 and correlation_df['reach'].std() > 0:
        corr_er, _ = spearmanr(correlation_df['engagement'], correlation_df['reach'])
        correlations['engage_reach'] = round(corr_er, 2)
        recommendations['engage_reach'] = get_recommendation_text(corr_er, "Engagement", "Reach")
    else:
        correlations['engage_reach'] = None
        recommendations['engage_reach'] = "Missing or invariant 'engagement' or 'reach' data for correlation analysis."

    if 'engagement' in correlation_df.columns and 'revenue' in correlation_df.columns and \
       correlation_df['engagement'].std() > 0 and correlation_df['revenue'].std() > 0:
        corr_es, _ = spearmanr(correlation_df['engagement'], correlation_df['revenue'])
        correlations['engage_sales'] = round(corr_es, 2)
        recommendations['engage_sales'] = get_recommendation_text(corr_es, "Engagement", "Sales")
    else:
        correlations['engage_sales'] = None
        recommendations['engage_sales'] = "Missing or invariant 'engagement' or 'sales' data for correlation analysis."

    if 'reach' in correlation_df.columns and 'revenue' in correlation_df.columns and \
       correlation_df['reach'].std() > 0 and correlation_df['revenue'].std() > 0:
        corr_rs, _ = spearmanr(correlation_df['reach'], correlation_df['revenue'])
        correlations['reach_sales'] = round(corr_rs, 2)
        recommendations['reach_sales'] = get_recommendation_text(corr_rs, "Reach", "Sales")
    else:
        correlations['reach_sales'] = None
        recommendations['reach_sales'] = "Missing or invariant 'reach' or 'sales' data for correlation analysis."

    return jsonify({
        "message": "Correlation analysis successful.",
        "correlations": correlations,
        "recommendations": recommendations,
        "chart_data": chart_data # Include the data for plotting
    })

# --- NEW ACTIVITY LOGGING ENDPOINT ---
@app.route('/api/log_activity', methods=['POST'])
@verify_token
def log_activity():
    """
    API endpoint to log user activities in the Supabase 'activity_logs' table.
    Expects JSON data with 'action' and 'details' fields.
    """
    data = request.json
    action = data.get('action')
    details = data.get('details')
    
    if not action:
        return jsonify({"error": "Activity 'action' is required."}), 400

    # Get user ID from the verified token
    user_id = request.current_user.get('uid')
    if not user_id:
        logging.warning("Attempted to log activity without a valid user ID from token.")
        # We could still log it as an anonymous action or return an error.
        # For now, we'll return an error if user_id is missing from a verified token context.
        return jsonify({"error": "User ID not found in token for activity logging."}), 401

    try:
        log_entry = {
            "id": str(uuid.uuid4()), # Generate a unique ID for the log entry
            "user_id": user_id,
            "action": action,
            "details": details,
            "timestamp": datetime.utcnow().isoformat() + "Z" # ISO 8601 format with 'Z' for UTC
        }

        url = f"{SUPABASE_URL}/rest/v1/activity_logs"
        response = requests.post(url, headers=HEADERS.copy(), json=[log_entry])

        if response.status_code in [200, 201]:
            logging.info(f"Activity logged successfully for user {user_id}: {action}")
            return jsonify({"message": "Activity logged successfully."}), 201
        else:
            logging.error(f"Failed to log activity for user {user_id}. Status: {response.status_code}, Response: {response.text}")
            return jsonify({"error": "Failed to log activity.", "details": response.text}), response.status_code
    except Exception as e:
        logging.error(f"Server error while logging activity: {e}", exc_info=True)
        return jsonify({"error": f"An error occurred while logging activity: {str(e)}"}), 500

# NEW API ENDPOINT FOR ACTIVITY LOGS (ADMIN ONLY)
@app.route('/api/activity_logs', methods=['GET'])
@verify_token
@admin_required
def get_activity_logs():
    """
    API endpoint to fetch activity logs with pagination and filtering for admins.
    Filters: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD), user_id (Firebase UID).
    Pagination: page (1-indexed), limit (items per page).
    """
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    user_id = request.args.get('user_id')

    offset = (page - 1) * limit

    filters = {}
    if user_id:
        filters['user_id'] = user_id

    try:
        logs, total_count = fetch_table(
            "activity_logs", 
            select="id,user_id,action,details,timestamp", 
            order="timestamp.desc", # Order by latest first
            limit=limit, 
            offset=offset, 
            count=True,
            start_date=start_date,
            end_date=end_date,
            filters=filters
        )
        
        return jsonify({
            "logs": logs,
            "total_count": total_count,
            "page": page,
            "limit": limit
        }), 200
    except Exception as e:
        logging.error(f"Error fetching activity logs: {e}", exc_info=True)
        return jsonify({"error": f"Failed to retrieve activity logs: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(debug=True, host='127.0.0.1', port=5000)
