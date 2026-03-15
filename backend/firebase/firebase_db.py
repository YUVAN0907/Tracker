"""
Firebase Data Access Layer
Generic CRUD helpers for Firestore collections.
All functions operate on the Firestore client initialized in firebase_config.py.
"""
from firebase_config import db
from google.cloud.firestore_v1.base_query import FieldFilter


# --------------------------------------------------
# GENERIC CRUD
# --------------------------------------------------

def get_collection(collection_name):
    """Get all documents from a collection as a list of dicts."""
    docs = db.collection(collection_name).stream()
    result = []
    for doc in docs:
        d = doc.to_dict()
        d["_doc_id"] = doc.id  # Include Firestore doc ID for updates/deletes
        result.append(d)
    return result


def get_doc(collection_name, doc_id):
    """Get a single document by ID."""
    doc = db.collection(collection_name).document(str(doc_id)).get()
    if doc.exists:
        d = doc.to_dict()
        d["_doc_id"] = doc.id
        return d
    return None


def add_doc(collection_name, data, doc_id=None):
    """Add a document. If doc_id is provided, use it as document ID."""
    # Remove internal fields before writing
    clean = {k: v for k, v in data.items() if not k.startswith("_")}
    if doc_id:
        db.collection(collection_name).document(str(doc_id)).set(clean)
        return str(doc_id)
    else:
        _, doc_ref = db.collection(collection_name).add(clean)
        return doc_ref.id


def update_doc(collection_name, doc_id, data):
    """Update specific fields in a document."""
    clean = {k: v for k, v in data.items() if not k.startswith("_")}
    db.collection(collection_name).document(str(doc_id)).update(clean)


def set_doc(collection_name, doc_id, data):
    """Set (overwrite) a document."""
    clean = {k: v for k, v in data.items() if not k.startswith("_")}
    db.collection(collection_name).document(str(doc_id)).set(clean)


def delete_doc(collection_name, doc_id):
    """Delete a document by ID."""
    db.collection(collection_name).document(str(doc_id)).delete()


def query_collection(collection_name, field, op, value):
    """Query a collection with a single filter.
    op can be: ==, !=, <, <=, >, >=, in, not-in, array-contains, array-contains-any
    """
    docs = (
        db.collection(collection_name)
        .where(filter=FieldFilter(field, op, value))
        .stream()
    )
    result = []
    for doc in docs:
        d = doc.to_dict()
        d["_doc_id"] = doc.id
        result.append(d)
    return result


def query_collection_multi(collection_name, filters):
    """Query with multiple filters. filters = [(field, op, value), ...]"""
    ref = db.collection(collection_name)
    for field, op, value in filters:
        ref = ref.where(filter=FieldFilter(field, op, value))
    docs = ref.stream()
    result = []
    for doc in docs:
        d = doc.to_dict()
        d["_doc_id"] = doc.id
        result.append(d)
    return result


def batch_write(operations):
    """Execute multiple writes in a single batch.
    operations: list of tuples (action, collection, doc_id, data)
    action: 'set', 'update', 'delete'
    """
    batch = db.batch()
    for op in operations:
        action = op[0]
        collection = op[1]
        doc_id = op[2]
        ref = db.collection(collection).document(str(doc_id))
        
        if action == "set":
            data = {k: v for k, v in op[3].items() if not k.startswith("_")}
            batch.set(ref, data)
        elif action == "update":
            data = {k: v for k, v in op[3].items() if not k.startswith("_")}
            batch.update(ref, data)
        elif action == "delete":
            batch.delete(ref)
    
    batch.commit()


def delete_collection(collection_name, batch_size=100):
    """Delete all documents in a collection (for migration reset)."""
    coll_ref = db.collection(collection_name)
    while True:
        docs = coll_ref.limit(batch_size).stream()
        deleted = 0
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
            deleted += 1
        if deleted == 0:
            break
        batch.commit()
