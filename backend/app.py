from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import io
import requests
import firebase_admin
from datetime import datetime, timedelta
from io import BytesIO
from firebase_admin import credentials, auth
from functools import wraps
import uuid # Import the UUID module for generating unique IDs
import logging # Import logging module
import urllib.parse # Import urllib.parse for manual URL encoding

app = Flask(__name__)
CORS(app)

# Configure logging to show info messages
logging.basicConfig(level=logging.INFO)

# --- Supabase config ---
SUPABASE_URL = "https://jfajaxpzkjqvdibdyibz.supabase.co"
SUPABASE_API_KEY = "REMOVED.geM5QBwNnagPeaHdZxTwkbtIfMBubR8rGX1cgbDlj10"

HEADERS = {
    "apikey": SUPABASE_API_KEY,
    "Authorization": f"Bearer {SUPABASE_API_KEY}",
    "Content-Type": "application/json"
}

def fetch_table(table_name, select="*", order=None, limit=None, start_date=None, end_date=None):
    """
    Fetches data from a specified Supabase table, implementing pagination.

    Args:
        table_name (str): The name of the table to fetch data from.
        select (str): The columns to select (e.g., "*", "column1,column2").
        order (str): The column to order by (e.g., "date.asc", "sales.desc").
        limit (int): The maximum number of rows to return (if None, fetches all).
        start_date (str): Optional start date in YYYY-MM-DD format for filtering.
        end_date (str): Optional end date in YYYY-MM-DD format for filtering.

    Returns:
        list: A list of dictionaries representing the fetched rows.
    """
    base_url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    all_records = []
    offset = 0
    page_size = 1000 # Fetch 1000 records at a time

    while True:
        query_parts = []
        query_parts.append(f"select={urllib.parse.quote(select)}")

        if order:
            query_parts.append(f"order={urllib.parse.quote(order)}")
        
        # Add date filtering with 'column=operator.value' syntax and explicit quoting
        if start_date:
            query_parts.append(f"date=gte.{urllib.parse.quote(str(start_date))}")
        if end_date:
            query_parts.append(f"date=lte.{urllib.parse.quote(str(end_date))}")
        
        # Add pagination (offset and limit for the current page)
        # Using Supabase's `limit` parameter for each paginated request instead of Range header
        # as it's simpler to combine with other query parameters.
        query_parts.append(f"offset={offset}")
        query_parts.append(f"limit={page_size}")

        full_url = f"{base_url}?{'&'.join(query_parts)}"

        current_headers = HEADERS.copy()
        # No Range header needed if using offset/limit query parameters directly.
        
        logging.info(f"Attempting to fetch from URL (page {offset // page_size + 1}): {full_url}")

        response = requests.get(full_url, headers=current_headers)
        
        logging.info(f"Response status from Supabase for {table_name} (page {offset // page_size + 1}): {response.status_code}")

        if response.status_code == 200:
            records_page = response.json()
            if not records_page:
                break # No more records to fetch

            all_records.extend(records_page)
            
            # If a specific limit was requested and we've reached it, stop fetching
            if limit is not None and len(all_records) >= limit:
                all_records = all_records[:limit] # Trim to the requested limit
                break

            # If the number of records returned is less than the page_size, it's the last page
            if len(records_page) < page_size:
                break
            
            offset += page_size # Move to the next page
        else:
            logging.error(f"Error fetching table {table_name}: {response.status_code} - {response.text}")
            break # Exit loop on error

    return all_records

def fetch_summary(table_name, field, start_date=None, end_date=None): # Added date parameters
    """
    Fetches the sum of a specific field from a Supabase table with optional date filtering.

    Args:
        table_name (str): The name of the table.
        field (str): The field to sum (e.g., "sales", "reach").
        start_date (str): Optional start date in YYYY-MM-DD format for filtering.
        end_date (str): Optional end date in YYYY-MM-DD format for filtering.

    Returns:
        float or int: The sum of the field, or 0 if an error occurs or no data.
    """
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    params = {
        "select": f"sum({field})"
    }
    
    # Add date filtering to params
    if start_date:
        params[f"date"] = f"gte.{urllib.parse.quote(str(start_date))}"
    if end_date:
        params[f"date"] = f"lte.{urllib.parse.quote(str(end_date))}"

    logging.info(f"Attempting to fetch summary from URL: {url} with params: {params} and headers: {HEADERS}")
    response = requests.get(url, headers=HEADERS, params=params)
    
    logging.info(f"Response status from Supabase summary for {table_name} - {field}: {response.status_code}")
    logging.info(f"Response text from Supabase summary for {table_name} - {field}: {response.text}")

    if response.status_code == 200 and response.json():
        # Supabase usually returns [{"sum": value}] or [{"sum_field": value}]
        sum_key = next(iter(response.json()[0].keys())) # Get the key dynamically
        return response.json()[0][sum_key]
    else:
        logging.error(f"Error fetching summary for {table_name} - {field}: {response.status_code} - {response.text}")
        return 0

def fetch_top_products(limit=5, start_date=None, end_date=None): # Added date parameters
    """
    Fetches the top products by sales, aggregating from the 'sales' table
    and joining with 'products' table for product names, with optional date filtering.

    Args:
        limit (int): The number of top products to return.
        start_date (str): Optional start date in YYYY-MM-DD format for filtering.
        end_date (str): Optional end date in YYYY-MM-DD format for filtering.

    Returns:
        list: A list of dictionaries, each containing 'product_name' and 'sales'.
    """
    # 1. Fetch sales data (product_id and total_price) with date filtering
    sales_data = fetch_table("sales", select="product_id,revenue,date", start_date=start_date, end_date=end_date) 
    
    if not sales_data:
        logging.info("No sales data available for top product calculation.")
        return []

    sales_df = pd.DataFrame(sales_data)
    # Ensure revenue is numeric, as it might come as string from DB or be null
    sales_df['revenue'] = pd.to_numeric(sales_df['revenue'], errors='coerce').fillna(0)

    # Aggregate sales by product_id
    aggregated_sales = sales_df.groupby('product_id')['revenue'].sum().reset_index()
    aggregated_sales.rename(columns={'revenue': 'sales'}, inplace=True) # Rename for consistency

    # 2. Fetch product information (product_id and product_name) - now using pagination
    products_info = fetch_table("products", select="product_id,product_name")

    if not products_info:
        logging.info("No product info available for top product calculation.")
        return []

    products_df = pd.DataFrame(products_info)

    # 3. Join the two dataframes to get product_name alongside aggregated sales
    merged_df = pd.merge(aggregated_sales, products_df, on='product_id', how='inner')

    # Sort by sales in descending order and take the top 'limit'
    top_products_df = merged_df.sort_values(by='sales', ascending=False).head(limit)

    # Return as list of dictionaries
    return top_products_df[['product_name', 'sales']].to_dict(orient='records')

@app.route('/api/tiktokdata')
def tiktok_data():
    """API endpoint to get TikTok data, ordered by date, WITHOUT frontend date filtering (handled client-side)."""
    # Removed start_date and end_date from request.args.get as filtering is done client-side.
    data = fetch_table("tiktokdata", order="date.asc", limit=None) # Removed date parameters
    return jsonify(data)

@app.route('/api/facebookdata')
def facebook_data():
    """API endpoint to get Facebook data, ordered by date, WITHOUT frontend date filtering (handled client-side)."""
    # Removed start_date and end_date from request.args.get as filtering is done client-side.
    data = fetch_table("facebookdata", order="date.asc", limit=None) # Removed date parameters
    return jsonify(data)

@app.route('/api/salesdata')
def sales_data():
    """API endpoint to get Sales data, ordered by date, with optional date filtering."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    # Use explicit limit=None to ensure pagination in fetch_table to get all sales data
    data = fetch_table("sales", order="date.asc", limit=None, start_date=start_date, end_date=end_date)
    return jsonify(data)

@app.route('/api/sales/summary')
def sales_summary():
    """API endpoint to get the total sales summary. Currently not used by frontend for main summary."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    # Assuming 'sales' table has a 'revenue' column for total sales
    total_sales = fetch_summary("sales", "revenue", start_date=start_date, end_date=end_date) 
    return jsonify({"total_sales": total_sales})

@app.route('/api/sales/top')
def sales_top():
    """API endpoint to get the top products by sales, with optional date filtering."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    top_products = fetch_top_products(start_date=start_date, end_date=end_date) # Pass date parameters
    return jsonify(top_products)

@app.route('/api/tiktok/reach_summary')
def tiktok_reach_summary():
    """API endpoint to get the total reach (views) for TikTok data. Currently not used by frontend for main summary."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    total_views = fetch_summary("tiktokdata", "views", start_date=start_date, end_date=end_date)
    return jsonify({"total_tiktok_reach": total_views})

@app.route('/api/tiktok/engagement_summary')
def tiktok_engagement_summary():
    """API endpoint to get the total engagement (likes + comments + shares) for TikTok data. Currently not used by frontend for main summary."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    total_likes = fetch_summary("tiktokdata", "likes", start_date=start_date, end_date=end_date)
    total_comments = fetch_summary("tiktokdata", "comments", start_date=start_date, end_date=end_date)
    total_shares = fetch_summary("tiktokdata", "shares", start_date=start_date, end_date=end_date)
    total_engagement = (total_likes or 0) + (total_comments or 0) + (total_shares or 0)
    return jsonify({"total_tiktok_engagement": total_engagement})

# Initialize Firebase Admin SDK
# IMPORTANT: Ensure 'serviceAccountKey.json' path is correct for your environment.
try:
    # Use os.getenv for environment variable for production, or a relative path for local development
    # For local development, you might place serviceAccountKey.json in the same directory as app.py
    # and use: credentials.Certificate('serviceAccountKey.json')
    # For current setup, assuming absolute path from initial shared snippet
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
        return jsonify({'message': 'User deleted'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/upload-data', methods=['POST'])
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

        # Validate and format 'date' column for all data types that use it
        if 'date' in df.columns:
            try:
                df['date'] = pd.to_datetime(df['date']).dt.date
                df['date'] = df['date'].astype(str) # Convert date objects to strings for JSON serializability
            except Exception as e:
                return jsonify({"message": f"Error parsing 'date' column: {str(e)}. "
                                         "Please ensure dates are in a recognizable format (e.g.,YYYY-MM-DD)."}), 400
        
        # --- Handle different app types ---
        if app_name.lower() == "facebook":
            table_name = "facebookdata"
            required_columns = {'date', 'likes', 'comments', 'shares', 'reach'}

            # Check for existing post_id or post_url, otherwise generate
            if 'post_id' in df.columns:
                required_columns.add('post_id')
            elif 'post_url' in df.columns:
                required_columns.add('post_url')
            else:
                # If no unique post identifier exists, generate one
                df['post_id'] = [str(uuid.uuid4()) for _ in range(len(df))]
                required_columns.add('post_id') # Add it to required columns as it's now present
            
            # For Facebook, deduplicate based on date and post_id/url if multiple entries in batch
            deduplication_subset = ['date']
            if 'post_id' in df.columns:
                deduplication_subset.append('post_id')
            elif 'post_url' in df.columns:
                deduplication_subset.append('post_url')
            df.drop_duplicates(subset=deduplication_subset, keep='last', inplace=True)

            df_to_upload = df[list(required_columns)]
            records = df_to_upload.to_dict(orient='records')
            target_tables = {table_name: records}

        elif app_name.lower() == "tiktok":
            table_name = "tiktokdata"
            # Required columns for TikTok based on your provided schema (excluding commented parts)
            required_columns = {'date', 'views', 'likes', 'comments', 'shares'}

            # --- AGGREGATE TIKTOK DATA BY DATE ---
            # Since 'date' is the PRIMARY KEY in tiktokdata, ensure only one entry per date.
            # If the uploaded file contains multiple entries for the same date, sum them up.
            df = df.groupby('date').agg(
                views=('views', 'sum'),
                likes=('likes', 'sum'),
                comments=('comments', 'sum'),
                shares=('shares', 'sum')
            ).reset_index() # Reset index to make 'date' a regular column again

            # Ensure all required columns are still present after aggregation
            for col in ['views', 'likes', 'comments', 'shares']:
                if col not in df.columns:
                    df[col] = 0 # Add missing aggregated columns with default 0

            df_to_upload = df[list(required_columns)]
            records = df_to_upload.to_dict(orient='records')
            target_tables = {table_name: records}

        elif app_name.lower() == "sales": 
            # Normalization for 'products' and 'sales' tables
            products_table_name = "products"
            sales_table_name = "sales"

            # Define expected columns from the uploaded file for sales data (using actual column names after stripping/lowercasing)
            required_sales_columns = {'date', 'product id', 'product name', 'quantity sold', 'price', 'revenue'}
            
            # Check if all required columns are in the DataFrame
            if not required_sales_columns.issubset(df.columns):
                missing_columns = list(required_sales_columns - set(df.columns))
                return jsonify({
                    "message": f"Missing required columns for Sales data. "
                               f"Expected: {sorted(list(required_sales_columns))}. Missing: {sorted(missing_columns)}."
                }), 400

            # Rename columns for internal consistency after the check
            df.rename(columns={
                'product id': 'product_id',
                'product name': 'product_name',
                'quantity sold': 'quantity', # Internal name 'quantity'
                'price': 'price_per_unit' # Renaming for internal use
            }, inplace=True)

            # Ensure numeric columns are indeed numeric
            for col in ['quantity', 'price_per_unit', 'revenue']:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0) 

            # Calculate total_price for each sale record (if not using 'revenue' directly)
            if 'revenue' in df.columns:
                df['total_price'] = df['revenue']
            else:
                df['total_price'] = df['quantity'] * df['price_per_unit']


            # --- Normalize for Products Table ---
            # Extract unique products and their aggregated sales
            # If 'product_id' is provided in the uploaded file, use it; otherwise, generate UUIDs.
            if 'product_id' in df.columns:
                products_df = df[['product_id', 'product_name']].drop_duplicates().copy()
                products_df['product_id'] = products_df['product_id'].astype(str) # Ensure product_id is string
            else:
                # Generate product_id if not provided
                unique_products = df[['product_name']].drop_duplicates().copy()
                unique_products['product_id'] = [str(uuid.uuid4()) for _ in range(len(unique_products))]
                
                # Merge back to original df to get product_id for sales table
                df = pd.merge(df, unique_products, on='product_name', how='left')

                products_df = unique_products # products_df is now just product_id and product_name

            products_records = products_df[['product_id', 'product_name']].to_dict(orient='records') # Ensure only these columns are sent
            logging.info(f"Products records for upload: {products_records}")

            # --- Normalize for Sales Table ---
            sales_df = df.copy()
            
            # Generate sale_id for each record as per new schema
            sales_df['sale_id'] = [str(uuid.uuid4()) for _ in range(len(sales_df))]

            # Ensure 'product_id' is present after the merge/generation step
            if 'product_id' not in sales_df.columns:
                return jsonify({"message": "Internal error: product_id not generated/mapped for sales data."}), 500

            # Map internal DataFrame columns back to Supabase 'sales' table column names
            sales_records = sales_df.rename(columns={
                'price_per_unit': 'price', # Map internal 'price_per_unit' back to Supabase 'price'
                'total_price': 'revenue',    # Map internal 'total_price' to Supabase 'revenue'
                'quantity': 'quantity_sold' # Map internal 'quantity' back to Supabase 'quantity_sold'
            })[[
                'sale_id', 'product_id', 'date', 'quantity_sold', 'price', 'revenue' # Include sale_id here
            ]].to_dict(orient='records')
            logging.info(f"Sales records for upload: {sales_records}")

            # Define tables to upload to
            target_tables = {
                products_table_name: products_records,
                sales_table_name: sales_records
            }

        else:
            return jsonify({"message": f"Unsupported app name provided: '{app_name}'. "
                                      "Please select 'Facebook', 'TikTok', or 'Sales'."}), 400

        # Iterate through target tables and upload data
        upload_messages = []
        for tbl_name, records in target_tables.items():
            if not records:
                upload_messages.append(f"No data to upload for table: {tbl_name}.")
                continue

            url = f"{SUPABASE_URL}/rest/v1/{tbl_name}"
            supabase_headers = HEADERS.copy()
            
            # ONLY use merge-duplicates for 'products' table, as it's for upserting products
            # For 'sales' table, we are now inserting with a new primary key (sale_id)
            if tbl_name == "products":
                supabase_headers["Prefer"] = "resolution=merge-duplicates"
            else:
                # For sales table, simply insert (no Prefer header needed for default insert behavior)
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
                # If one table upload fails, consider the overall operation a failure for now
                return jsonify({"message": "; ".join(upload_messages)}), response.status_code

        return jsonify({"message": "; ".join(upload_messages)}), 200

    except Exception as e:
        return jsonify({"message": f"Server error during file upload processing: {str(e)}"}), 500
    
if __name__ == "__main__":
    app.run(debug=True, host='127.0.0.1', port=5000)
