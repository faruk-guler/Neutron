from flask import Flask, render_template, request, jsonify, redirect, url_for, Response
from flask_login import LoginManager, login_user, login_required, logout_user, current_user
import json
import os
import yaml
import subprocess
import logging
from models import User, users

# Configure logging for Clean Code & Debugging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'neutron-secret-key-ultimate'

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return users.get(user_id)

# Centralized Path Management (DRY Principle)
class PathManager:
    @staticmethod
    def get_root_dir():
        # app.py is 3 levels deep from root
        return os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

    @staticmethod
    def get_config_path():
        return os.path.join(PathManager.get_root_dir(), 'config.yaml')

    @staticmethod
    def get_deploy_path():
        return os.path.join(PathManager.get_root_dir(), 'deploy.yaml')

    @staticmethod
    def get_script_path():
        # Using the new Go Core native binary
        return os.path.join(PathManager.get_root_dir(), 'neutron-core.exe')

    @staticmethod
    def get_audit_path():
        return os.path.join(os.path.dirname(__file__), 'audit_log.txt')

def load_yaml(path):
    try:
        if not os.path.exists(path):
            logger.warning(f"File not found: {path}")
            return None
        with open(path, 'r') as f:
            return yaml.safe_load(f)
    except Exception as e:
        logger.error(f"Error parsing YAML at {path}: {e}")
        return None

# Basic command sanitization
def sanitize_command(cmd):
    disallowed = [';', '&&', '||', '|', '>', '<', '&', '$', '(', ')', '[', ']', '{', '}', '*', '?', '~', '`']
    for char in disallowed:
        if char in cmd:
            if cmd.startswith(('grep', 'ls', 'cat')): # Allowed exceptions
                continue
            return None
    return cmd

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = users.get(request.form.get('username'))
        if user and user.password == request.form.get('password'):
            login_user(user)
            return redirect(url_for('index'))
        return render_template('login.html', error='Invalid credentials')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    config = load_yaml(PathManager.get_config_path())
    return render_template('dashboard.html', active_page='dashboard', config=config)

@app.route('/api/hosts/status')
@login_required
def hosts_status():
    config = load_yaml(PathManager.get_config_path())
    if not config or 'hosts' not in config:
        return jsonify({})
    
    status_map = {}
    for entry in config['hosts']:
        host = entry.split(':')[0]
        try:
            # -n 1 (1 packet), -w 1000 (1ms timeout)
            res = subprocess.run(['ping', '-n', '1', '-w', '1000', host], capture_output=True)
            status_map[host] = "online" if res.returncode == 0 else "offline"
        except Exception as e:
            logger.error(f"Ping failed for {host}: {e}")
            status_map[host] = "unknown"
    return jsonify(status_map)

@app.route('/api/playbooks')
@login_required
def api_playbooks():
    deploy_data = load_yaml(PathManager.get_deploy_path())
    return jsonify(deploy_data.get('commands', []) if deploy_data else [])

@app.route('/api/execute')
@login_required
def api_execute():
    raw_cmd = request.args.get('cmd')
    if not raw_cmd:
        return "No command provided", 400
        
    command = sanitize_command(raw_cmd)
    if not command:
        return jsonify({"type": "stderr", "data": "COMMAND ERROR: Restricted characters."}), 403

    def stream_command():
        # Using the new Go Core with native flags
        try:
            p = subprocess.Popen(
                [PathManager.get_script_path(), '-cmd', command, '-q'], 
                stdout=subprocess.PIPE, 
                stderr=subprocess.STDOUT, 
                text=True, 
                bufsize=1, 
                cwd=PathManager.get_root_dir()
            )
            
            # Audit Logging
            with open(PathManager.get_audit_path(), 'a') as f:
                f.write(f"{current_user.id} | {command}\n")

            for line in p.stdout:
                yield f"data: {json.dumps({'type': 'stdout', 'data': line})}\n\n"
            p.wait()
            yield f"data: {json.dumps({'type': 'exit', 'code': p.returncode})}\n\n"
        except Exception as e:
            logger.error(f"Go Core Execution error: {e}")
            yield f"data: {json.dumps({'type': 'stderr', 'data': str(e)})}\n\n"

    return Response(stream_command(), mimetype='text/event-stream')

@app.route('/audit-log')
@login_required
def audit_log():
    logs = []
    audit_path = PathManager.get_audit_path()
    if os.path.exists(audit_path):
        with open(audit_path, 'r') as f:
            logs = f.readlines()
    return render_template('audit_log.html', active_page='audit', logs=logs)

@app.route('/toggle_theme', methods=['POST'])
def toggle_theme():
    theme = request.form.get('theme', 'light')
    response = redirect(request.referrer or url_for('index'))
    response.set_cookie('theme', theme, max_age=60*60*24*365)
    return response

if __name__ == '__main__':
    logger.info("Starting Neutron v10 on port 2300...")
    app.run(host='0.0.0.0', port=2300, debug=True)