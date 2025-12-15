# Money Spender - Bank Statement Reader

A web application for reading and analyzing BKS Bank PDF statements. Track your spending, categorize transactions, and visualize where your money goes.





https://github.com/user-attachments/assets/cb968855-af86-4539-bbbc-6a37fd049806


## Features

- **PDF Import**: Upload BKS Bank PDF statements - they're automatically parsed and saved
- **Auto-load**: All previously uploaded statements load automatically on startup
- **Transaction Categorization**: Assign categories to transactions (Food, Transport, Entertainment, etc.)
- **Auto-categorization**: Set a category once and it applies to all matching transactions by merchant name or payer
- **Monthly Overview**: View income and expenses broken down by month
- **Donut Chart**: Visual breakdown of spending by category
- **Filters**: Search and filter transactions by month, type, or category
- **Privacy Mode**: Toggle to scramble all numbers for screen recording or screenshots

## Setup

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:5002 in your browser.

## Usage

1. Drop a PDF bank statement or click to upload
2. Click on any transaction to assign a category
3. Categories auto-apply to similar transactions (same merchant or payer name)
4. Use the monthly cards to filter by specific months
5. Toggle "Privacy" button to hide real numbers when recording

## Tech Stack

- Backend: Flask, pdfplumber
- Frontend: Vanilla JS, Chart.js
- Storage: JSON files for categories, uploads folder for PDFs
