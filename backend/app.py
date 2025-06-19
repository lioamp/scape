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
import uuid
import logging
import urllib.parse
from pmdarima import auto_arima # For ARIMA model
import numpy as np # For numerical operations
import json # For JSON serialization of results
from sklearn.linear_model import LinearRegression # For linear regression fallback
import asyncio # For async functions - needed if using truly async HTTP clients or other async operations

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)

# --- Supabase config ---
SUPABASE_URL = "https://jfajaxpzkjqvdibdyibz.supabase.co"
SUPABASE_API_KEY = "REMOVED.geM5QBwNnagPeaHdZxTwkbtIfMBubR8rGX1cgbDlj10"

HEADERS = {
    "apikey": SUPABASE_API_KEY,
    "Authorization": f"Bearer {SUPABASE_API_KEY}",
    "Content-Type": "application/json"
}

# Initialize Firebase Admin SDK
try:
    firebase_admin.get_app()
    logging.info("Firebase Admin SDK already initialized.")
except ValueError:
    service_account_key_path = r'C:\Users\hrczi\OneDrive\Documents\scape\backend\serviceAccountKey.json'
    
    try:
        cred = credentials.Certificate(service_account_key_path)
        firebase_admin.initialize_app(cred)
        logging.info("Firebase Admin SDK initialized successfully.")
    except Exception as e:
        logging.error(f"Error initializing Firebase Admin SDK from {service_account_key_path}: {e}", exc_info=True)
        print(f"Error initializing Firebase Admin SDK: {e}")
        print("Firebase features (user management) might not work correctly. Please ensure serviceAccountKey.json is correct.")


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
            request.current_user = decoded_token
            logging.info(f"Token verified for user: {decoded_token['uid']}")
        except Exception as e:
            logging.error(f"Error verifying token: {e}", exc_info=True)
            return jsonify({"error": "Invalid or expired token. Please log in again."}), 401
        return f(*args, **kwargs)
    return decorated_function

# Helper to fetch data from Supabase
def fetch_table(table_name, select="*", order=None, limit=None, start_date=None, end_date=None):
    """
    Fetches data from a specified Supabase table, implementing pagination.
    """
    base_url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    all_records = []
    offset = 0
    page_size = 1000

    while True:
        query_parts = []
        query_parts.append(f"select={urllib.parse.quote(select)}")

        if order:
            query_parts.append(f"order={urllib.parse.quote(order)}")
        
        if start_date:
            query_parts.append(f"date=gte.{urllib.parse.quote(str(start_date))}")
        if end_date:
            query_parts.append(f"date=lte.{urllib.parse.quote(str(end_date))}")
        
        query_parts.append(f"offset={offset}")
        query_parts.append(f"limit={page_size}")

        full_url = f"{base_url}?{'&'.join(query_parts)}"

        current_headers = HEADERS.copy()
        
        logging.info(f"Attempting to fetch from URL (page {offset // page_size + 1}): {full_url}")

        response = requests.get(full_url, headers=current_headers)
        
        logging.info(f"Response status from Supabase for {table_name} (page {offset // page_size + 1}): {response.status_code}")

        if response.status_code == 200:
            records_page = response.json()
            if not records_page:
                break

            all_records.extend(records_page)
            
            if limit is not None and len(all_records) >= limit:
                all_records = all_records[:limit]
                break

            if len(records_page) < page_size:
                break
            
            offset += page_size
        else:
            logging.error(f"Error fetching table {table_name}: {response.status_code} - {response.text}")
            break

    return all_records

def fetch_summary(table_name, field, start_date=None, end_date=None):
    """
    Fetches the sum of a specific field from a Supabase table with optional date filtering.
    """
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    params = {
        "select": f"sum({field})"
    }
    
    if start_date:
        params[f"date"] = f"gte.{urllib.parse.quote(str(start_date))}"
    if end_date:
        params[f"date"] = f"lte.{urllib.parse.quote(str(end_date))}"

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
    data = fetch_table("facebookdata", order="date.asc", limit=None)
    logging.info(f"Data fetched from Supabase for Facebook: {data}") # New debug log
    return jsonify(data)

@app.route('/api/tiktokdata')
@verify_token
def tiktok_data():
    """API endpoint to get raw TikTok data, ordered by date."""
    data = fetch_table("tiktokdata", order="date.asc", limit=None)
    logging.info(f"Data fetched from Supabase for TikTok: {data}") # New debug log
    return jsonify(data)


@app.route('/api/salesdata')
def sales_data():
    """API endpoint to get Sales data, ordered by date, with optional date filtering."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    data = fetch_table("sales", order="date.asc", limit=None, start_date=start_date, end_date=end_date)
    logging.info(f"Data fetched from Supabase for Sales: {data}") # New debug log
    return jsonify(data)

@app.route('/api/sales/summary')
def sales_summary():
    """API endpoint to get the total sales summary. Currently not used by frontend for main summary."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    total_sales = fetch_summary("sales", "revenue", start_date=start_date, end_date=end_date) 
    return jsonify({"total_sales": total_sales})

@app.route('/api/sales/top')
def sales_top():
    """API endpoint to get the top products by sales, with optional date filtering."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    top_products = fetch_top_products(start_date=start_date, end_date=end_date)
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


# Decorator to require admin privileges for certain API routes
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = request.headers.get('Authorization')
        if not id_token:
            return jsonify({'error': 'Missing Authorization header'}), 401
        try:
            id_token_prefix, token_value = id_token.split(' ', 1)
            if id_token_prefix.lower() != 'bearer':
                return jsonify({'error': 'Authorization header must start with Bearer'}), 401
            decoded_token = auth.verify_id_token(token_value)
            uid = decoded_token['uid']
            user = auth.get_user(uid)
            if user.custom_claims and user.custom_claims.get('admin'):
                return f(*args, **kwargs)
            else:
                return jsonify({'error': 'Admin privileges required'}), 403
        except Exception as e:
            return jsonify({'error': str(e)}), 401
    return decorated_function

@app.route('/api/users', methods=['GET'])
@admin_required
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
@admin_required
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
            auth.set_custom_user_claims(uid, None) # Clear claims if no roles provided
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
            return jsonify({'error': 'You cannot delete your own account'}), 403
        auth.delete_user(uid)
        return jsonify({'message': 'User deleted'}), 200 # Changed to 200 for success
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

            # Log the DataFrame head before any specific processing for Facebook
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
                    # Log column type and first few non-numeric values if found
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
            
            # Log the DataFrame head before any specific processing for TikTok
            logging.info(f"TikTok: DataFrame head before specific processing: {df.head().to_dict(orient='records')}")

            if not required_columns.issubset(df.columns):
                missing_cols = list(required_columns - set(df.columns))
                return jsonify({"message": f"Missing required TikTok columns: {', '.join(missing_cols)}. Expected: {', '.join(sorted(list(required_columns)))}"}), 400

            for col in ['views', 'likes', 'comments', 'shares']:
                if col in df.columns:
                    # Log column type and first few non-numeric values if found
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

def perform_arima_forecast(series, forecast_periods):
    """
    Performs ARIMA forecasting on a given time series.
    Returns forecasted values, lower bounds, upper bounds, and the actual last historical year.
    """
    logging.info(f"Attempting ARIMA forecast for {len(series)} data points.")
    if len(series) < 5: # ARIMA needs a reasonable amount of data
        logging.warning("Not enough data for ARIMA. Falling back to Linear Regression.")
        return perform_linear_regression_forecast(series, forecast_periods), series.index.max().year

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
            
            forecast_results.append({
                "year": int(forecast_year_dt.year), # Get the year as an integer
                "value": round(float(forecast.iloc[i]), 2),
                "lower_bound": round(float(conf_int[i][0]), 2),
                "upper_bound": round(float(conf_int[i][1]), 2)
            })
        logging.info(f"ARIMA forecast results: {forecast_results}")
        return forecast_results, last_historical_year_dt.year

    except Exception as e:
        logging.error(f"Error during ARIMA forecast: {e}", exc_info=True)
        logging.warning("ARIMA failed. Falling back to Linear Regression.")
        return perform_linear_regression_forecast(series, forecast_periods), series.index.max().year

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
        forecast_results.append({
            "year": int(forecast_years_int[i][0]), # Use the integer year directly
            "value": round(float(forecast_values[i]), 2),
            "lower_bound": round(float(forecast_values[i] * 0.9), 2), # Simple proxy for CI
            "upper_bound": round(float(forecast_values[i] * 1.1), 2)  # Simple proxy for CI
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
            recommendation += " This suggests a potential decline. It's crucial to analyze recent activities and re-evaluate your strategy to mitigate this trend."
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
            sales_records = fetch_table("sales", select="date,revenue", order="date.asc")
            df = pd.DataFrame(sales_records)
            df['date'] = pd.to_datetime(df['date'], errors='coerce') # Coerce errors will turn invalid dates into NaT
            df = df.dropna(subset=['date']) # Drop rows where date parsing failed
            df['revenue'] = pd.to_numeric(df['revenue'], errors='coerce').fillna(0)
            df = df.set_index('date')
            historical_series = df['revenue']

        elif metric_type == 'engagement' or metric_type == 'reach':
            metric_name = "Engagement" if metric_type == 'engagement' else "Reach"
            
            tiktok_records = fetch_table("tiktokdata", select="date,views,likes,comments,shares", order="date.asc")
            facebook_records = fetch_table("facebookdata", select="date,likes,comments,shares,reach", order="date.asc")
            
            combined_data = []
            
            for item in tiktok_records:
                combined_data.append({
                    "date": item.get('date'),
                    "likes": item.get('likes', 0),
                    "comments": item.get('comments', 0),
                    "shares": item.get('shares', 0),
                    "views": item.get('views', 0) # TikTok uses 'views'
                })
            
            for item in facebook_records:
                combined_data.append({
                    "date": item.get('date'),
                    "likes": item.get('likes', 0),
                    "comments": item.get('comments', 0),
                    "shares": item.get('shares', 0),
                    "views": item.get('reach', 0) # Facebook uses 'reach'
                })

            df = pd.DataFrame(combined_data)
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

        # Resample to annual data for forecasting
        historical_series_annual = historical_series.resample('YE').sum().dropna() 
        
        if historical_series_annual.empty or len(historical_series_annual) < 2:
            return jsonify({
                "historical_data": [],
                "forecast_data": [],
                "recommendation": f"Not enough historical data to generate a forecast for {metric_name}. Please upload more data spanning multiple years.",
                "message": "Not enough data for forecasting."
            }), 200

        # Dynamic forecast periods: at least the next 3 years
        last_historical_year_int = historical_series_annual.index.max().year 
        current_year = datetime.now().year
        
        # Calculate how many years are needed to reach at least (current_year + 3)
        # If last historical year is 2020 and current is 2024, (2024+3) - 2020 = 7 years (2021, 22, 23, 24, 25, 26, 27)
        # We need to forecast from last_historical_year_int + 1 up to current_year + 3
        forecast_periods = max(3, (current_year + 3) - last_historical_year_int)

        # If last historical year is already very far in the future, just forecast 1 year ahead
        if last_historical_year_int >= (current_year + 3):
            forecast_periods = 1
            logging.info(f"Historical data already covers well beyond current year + 3. Forecasting 1 period ahead.")
        elif last_historical_year_int >= current_year:
            # If last historical year is current year or future, but within the +3 range, forecast as needed
            # e.g., last_historical_year = 2024, current_year = 2024, forecast_periods = (2024+3)-2024 = 3
            # e.g., last_historical_year = 2025, current_year = 2024, forecast_periods = (2024+3)-2025 = 2
            forecast_periods = max(1, (current_year + 3) - last_historical_year_int)
            logging.info(f"Last historical data is at or after current year. Forecasting {forecast_periods} periods.")
        else: # last_historical_year_int is in the past relative to current year
            # We want to ensure at least 3 years from current_year, even if last historical data is old
            # The 'max(3, ...)' ensures we don't go below 3 years if there's a gap
            forecast_periods = (current_year + 3) - last_historical_year_int
            logging.info(f"Last historical data is in the past. Forecasting {forecast_periods} periods.")
        
        # Ensure minimum forecast period is 1 to always have a next year's forecast for recommendation
        if forecast_periods <= 0:
            forecast_periods = 1
            logging.info("Adjusted forecast_periods to 1 to ensure a next year prediction for recommendation.")


        forecast_results, actual_last_historical_year_for_forecast = perform_arima_forecast(historical_series_annual, forecast_periods)
        
        # Ensure that the years in forecast_results align with the intended future sequence.
        # This handles cases where ARIMA might return different indices.
        if forecast_results:
            # Reassign years to be consecutive starting from last_historical_year_int + 1
            for i in range(len(forecast_results)):
                forecast_results[i]['year'] = last_historical_year_int + 1 + i


        # Generate recommendation
        recommendation = generate_recommendation(historical_series_annual, forecast_results, metric_name)

        # Format historical data for frontend plotting
        historical_formatted = []
        for year_dt, value in historical_series_annual.items():
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


if __name__ == "__main__":
    app.run(debug=True, host='127.0.0.1', port=5000)
