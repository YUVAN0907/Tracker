import sys
import firebase_config  # This initializes the app with correct credentials
from firebase_admin import firestore

db = firestore.client(database_id='vendbeesdb')

phone = "9788296415"
short_phone = phone[-10:]

docs = list(db.collection('whatsappConversations').where('studentPhone', '==', short_phone).get())

if not docs:
    print(f"Conversation not found for {short_phone}")
    sys.exit(1)

doc_id = docs[0].id
db.collection('whatsappConversations').document(doc_id).update({
    'lastCustomerMessageTime': firestore.SERVER_TIMESTAMP,
    'conversationOpen': True,
    'conversationType': 'free_form'
})

print(f"Successfully opened 24-hour window for {phone}!")
