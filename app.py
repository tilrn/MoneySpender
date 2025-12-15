from flask import Flask, render_template, request, jsonify
import pdfplumber
import re
import os
import json
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

CATEGORIES_FILE = 'categories.json'
MERCHANT_CATEGORIES_FILE = 'merchant_categories.json'
ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def load_categories():
    if os.path.exists(CATEGORIES_FILE):
        with open(CATEGORIES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_categories(categories):
    with open(CATEGORIES_FILE, 'w', encoding='utf-8') as f:
        json.dump(categories, f, ensure_ascii=False, indent=2)

def load_merchant_categories():
    if os.path.exists(MERCHANT_CATEGORIES_FILE):
        with open(MERCHANT_CATEGORIES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_merchant_categories(merchant_categories):
    with open(MERCHANT_CATEGORIES_FILE, 'w', encoding='utf-8') as f:
        json.dump(merchant_categories, f, ensure_ascii=False, indent=2)

def get_merchant_key(transaction):
    """Generate a key for matching similar transactions."""
    desc = transaction.get('description', '').strip().upper()
    # Remove common variable parts like dates, IDs, amounts
    desc = re.sub(r'\d+', '', desc)  # Remove numbers
    desc = re.sub(r'\s+', ' ', desc).strip()  # Normalize spaces
    return desc if desc else None

def parse_bks_bank_pdf(pdf_path):
    """Parse BKS Bank PDF statement and extract transactions using text extraction."""
    transactions = []

    with pdfplumber.open(pdf_path) as pdf:
        full_text = ""
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n"

    # Split into lines
    lines = full_text.split('\n')

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Look for lines starting with a date (DD.MM.YYYY)
        date_match = re.match(r'^(\d{2}\.\d{2}\.\d{4})\s+(.+)$', line)

        if date_match:
            date = date_match.group(1)
            rest_of_line = date_match.group(2)

            # Parse the rest of the first line
            # Format: "account_number description amount(s) balance"
            # Example: "0038630600820 ERIK H.;sladoled 2,00 9,93"
            # Or: "35001-0001864446 BESTERO*SLASCICARNA OH 6,00 3,93"

            # Extract amounts from end of line (balance is last, then credit or debit)
            # Numbers use comma as decimal separator
            amounts = re.findall(r'(\d+,\d{2})', rest_of_line)

            if len(amounts) >= 2:
                # Last amount is balance, second to last is the transaction amount
                balance = float(amounts[-1].replace(',', '.'))
                amount = float(amounts[-2].replace(',', '.'))

                # Get description - everything between account number and amounts
                # Remove the amounts from the string to get description
                desc_part = rest_of_line
                for amt in amounts:
                    desc_part = desc_part.replace(amt, '', 1)

                # Extract account number and description
                parts = desc_part.strip().split(' ', 1)
                account = parts[0] if parts else ''
                description = parts[1].strip() if len(parts) > 1 else ''

                # Get payer/payee name from next line
                payer_payee = ''
                if i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    # Skip if it's another date line or ID trans line
                    if not re.match(r'^\d{2}\.\d{2}\.\d{4}', next_line) and not next_line.startswith('ID trans'):
                        if not next_line.startswith('/') and not next_line.startswith('MALE BRASLOV') and not next_line.startswith('HOSTNIK'):
                            # Clean ID trans references from payer name
                            payer_payee = re.sub(r'\s*ID trans\..*', '', next_line).strip()

                # Determine if expense or income based on account pattern
                # Incoming transfers (from others) start with 0038...
                # Outgoing (card payments, etc) are from own account 35001-...
                is_income = account.startswith('0038')

                # Clean description - remove ID trans references and trailing semicolons
                clean_desc = re.sub(r'ID trans\..*', '', description).strip()
                clean_desc = clean_desc.rstrip(';').strip()

                # For income (transfers from others), the description often has "NAME;note" format
                # Extract the name and note parts
                display_payer = payer_payee
                if is_income and ';' in description:
                    parts = description.split(';', 1)
                    display_payer = parts[0].strip()
                    if len(parts) > 1 and parts[1].strip():
                        clean_desc = parts[1].strip()
                    else:
                        clean_desc = f"Transfer from {display_payer}"
                elif not clean_desc:
                    clean_desc = payer_payee if payer_payee else description

                # Create unique ID
                trans_id = f"{date}_{clean_desc}_{amount}_{i}".replace(' ', '_')

                transactions.append({
                    'id': trans_id,
                    'date': date,
                    'payer_payee': display_payer if display_payer else account,
                    'description': clean_desc,
                    'debit': 0.0 if is_income else amount,
                    'credit': amount if is_income else 0.0,
                    'balance': balance,
                    'type': 'income' if is_income else 'expense',
                    'amount': amount
                })

        i += 1

    # Sort by date (newest first)
    transactions.sort(key=lambda x: datetime.strptime(x['date'], '%d.%m.%Y'), reverse=True)

    return transactions

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/all-transactions', methods=['GET'])
def get_all_transactions():
    """Load and combine all transactions from all saved PDFs."""
    all_transactions = []
    upload_folder = app.config['UPLOAD_FOLDER']

    if os.path.exists(upload_folder):
        for filename in os.listdir(upload_folder):
            if filename.endswith('.pdf'):
                filepath = os.path.join(upload_folder, filename)
                try:
                    transactions = parse_bks_bank_pdf(filepath)
                    all_transactions.extend(transactions)
                except Exception as e:
                    print(f"Error parsing {filename}: {e}")

    # Remove duplicates based on transaction ID
    seen_ids = set()
    unique_transactions = []
    for trans in all_transactions:
        if trans['id'] not in seen_ids:
            seen_ids.add(trans['id'])
            unique_transactions.append(trans)

    # Load existing categories and merchant categories
    categories = load_categories()
    merchant_categories = load_merchant_categories()

    # Apply categories - first by transaction ID, then by merchant key
    for trans in unique_transactions:
        if trans['id'] in categories:
            trans['category'] = categories[trans['id']]
        else:
            # Try to match by merchant key
            merchant_key = get_merchant_key(trans)
            if merchant_key and merchant_key in merchant_categories:
                trans['category'] = merchant_categories[merchant_key]

    # Sort by date (newest first)
    unique_transactions.sort(key=lambda x: datetime.strptime(x['date'], '%d.%m.%Y'), reverse=True)

    # Calculate monthly summaries
    monthly_data = {}
    for trans in unique_transactions:
        date_obj = datetime.strptime(trans['date'], '%d.%m.%Y')
        month_key = date_obj.strftime('%Y-%m')

        if month_key not in monthly_data:
            monthly_data[month_key] = {
                'month': date_obj.strftime('%B %Y'),
                'month_key': month_key,
                'income': 0,
                'expenses': 0
            }

        if trans['type'] == 'income':
            monthly_data[month_key]['income'] += trans['amount']
        else:
            monthly_data[month_key]['expenses'] += trans['amount']

    # Sort monthly data by date
    monthly_summary = sorted(monthly_data.values(), key=lambda x: x['month_key'], reverse=True)

    return jsonify({
        'success': True,
        'transactions': unique_transactions,
        'total_expenses': sum(t['debit'] for t in unique_transactions),
        'total_income': sum(t['credit'] for t in unique_transactions),
        'monthly_summary': monthly_summary,
        'statement_count': len([f for f in os.listdir(upload_folder) if f.endswith('.pdf')]) if os.path.exists(upload_folder) else 0
    })

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        try:
            transactions = parse_bks_bank_pdf(filepath)

            # Load existing categories and apply them
            categories = load_categories()
            for trans in transactions:
                if trans['id'] in categories:
                    trans['category'] = categories[trans['id']]

            return jsonify({
                'success': True,
                'transactions': transactions,
                'total_expenses': sum(t['debit'] for t in transactions),
                'total_income': sum(t['credit'] for t in transactions)
            })
        except Exception as e:
            return jsonify({'error': f'Error parsing PDF: {str(e)}'}), 500

    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/api/category', methods=['POST'])
def set_category():
    data = request.json
    trans_id = data.get('id')
    category = data.get('category')
    description = data.get('description', '')

    if not trans_id:
        return jsonify({'error': 'Transaction ID required'}), 400

    # Save category for this specific transaction
    categories = load_categories()
    categories[trans_id] = category
    save_categories(categories)

    # Also save merchant mapping for auto-categorization
    if description:
        merchant_key = description.strip().upper()
        merchant_key = re.sub(r'\d+', '', merchant_key)
        merchant_key = re.sub(r'\s+', ' ', merchant_key).strip()

        if merchant_key:
            merchant_categories = load_merchant_categories()
            merchant_categories[merchant_key] = category
            save_merchant_categories(merchant_categories)

    return jsonify({'success': True})

@app.route('/api/categories', methods=['GET'])
def get_categories():
    return jsonify(load_categories())

if __name__ == '__main__':
    os.makedirs('uploads', exist_ok=True)
    app.run(debug=True, port=5002)
