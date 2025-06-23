import firebase_admin
from firebase_admin import credentials, auth

cred = credentials.Certificate(r'C:\Users\hrczi\OneDrive\Documents\scape\backend\serviceAccountKey.json')
firebase_admin.initialize_app(cred)

def set_admin(uid):
    auth.set_custom_user_claims(uid, {"admin": True})
    print(f"Set admin claim for user {uid}")

# Replace with the UID of the user to make admin
if __name__ == "__main__":
    user_uid = input("Enter user UID to make admin: ")
    set_admin(user_uid)
