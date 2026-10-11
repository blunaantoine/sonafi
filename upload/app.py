from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3

app = Flask(__name__)
CORS(app)

DB_FILE = 'sonafi_pauses.db'
PAUSES_VALIDES = {'cafe', 'dejeuner', 'jeux'}


def get_db():
    """Ouvre une connexion à la base de données."""
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Crée les tables si elles n'existent pas."""
    conn = get_db()
    c = conn.cursor()
    # Mode WAL : meilleur comportement quand plusieurs téléphones scannent en même temps
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("""CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS pauses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_id TEXT NOT NULL,
        day INTEGER NOT NULL,
        pause_type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(participant_id, day, pause_type),
        FOREIGN KEY(participant_id) REFERENCES participants(id)
    )""")
    conn.commit()
    conn.close()


@app.route('/api/check-participant/<participant_id>', methods=['GET'])
def check_participant(participant_id):
    """Vérifie si un participant existe."""
    conn = get_db()
    row = conn.execute('SELECT id, name FROM participants WHERE id = ?',
                       (participant_id,)).fetchone()
    conn.close()
    if row:
        return jsonify({'exists': True, 'id': row['id'], 'name': row['name']})
    return jsonify({'exists': False}), 404


@app.route('/api/check-pause', methods=['POST'])
def check_pause():
    """Vérifie si une pause a déjà été prise."""
    data = request.get_json(silent=True) or {}
    conn = get_db()
    row = conn.execute(
        'SELECT id FROM pauses WHERE participant_id = ? AND day = ? AND pause_type = ?',
        (data.get('participant_id'), data.get('day'), data.get('pause_type'))
    ).fetchone()
    conn.close()
    return jsonify({'already_taken': row is not None})


@app.route('/api/record-pause', methods=['POST'])
def record_pause():
    """Enregistre le passage à une pause (refuse les doublons)."""
    data = request.get_json(silent=True) or {}
    participant_id = data.get('participant_id')
    day = data.get('day')
    pause_type = data.get('pause_type')

    if pause_type not in PAUSES_VALIDES or day not in (1, 2, 3) or not participant_id:
        return jsonify({'success': False, 'message': 'Données invalides'}), 400

    conn = get_db()
    try:
        conn.execute(
            'INSERT INTO pauses (participant_id, day, pause_type) VALUES (?, ?, ?)',
            (participant_id, day, pause_type))
        conn.commit()
        return jsonify({'success': True, 'message': 'Pause enregistrée'})
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'message': 'Pause déjà enregistrée'}), 409
    finally:
        conn.close()


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Nombre total de passages enregistrés."""
    conn = get_db()
    total = conn.execute('SELECT COUNT(*) AS total FROM pauses').fetchone()['total']
    conn.close()
    return jsonify({'total_scans': total})


# Création des tables au démarrage (aussi si lancé via gunicorn)
init_db()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
