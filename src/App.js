
// Solar PV Security Alarm System
// Enhanced with custom alarm sounds and rules for advanced monitoring
import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import './App.css';

// Register Chart.js components for power trend visualization
ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend);

function App() {
  // State for panels, alerts, rules, audio, and UI controls
  const [panels, setPanels] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [rules, setRules] = useState([]);
  const [inputData, setInputData] = useState('');
  const [selectedPanel, setSelectedPanel] = useState('All');
  const [selectedSeverity, setSelectedSeverity] = useState('All');
  const [powerThreshold, setPowerThreshold] = useState(50);
  const [voltageThreshold, setVoltageThreshold] = useState(200);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [ruleForm, setRuleForm] = useState({
    metric: 'power',
    condition: '<',
    value: '',
    severity: 'warning',
    message: '',
    editId: null,
  });
  const [criticalAudio, setCriticalAudio] = useState(null); // Custom critical audio URL
  const [warningAudio, setWarningAudio] = useState(null); // Custom warning audio URL
  const [criticalFileName, setCriticalFileName] = useState('Default (880 Hz)');
  const [warningFileName, setWarningFileName] = useState('Default (440 Hz)');

  // Load saved data on mount
  useEffect(() => {
    const savedPanels = localStorage.getItem('panels');
    const savedAlerts = localStorage.getItem('alerts');
    const savedRules = localStorage.getItem('rules');
    const savedCriticalAudio = localStorage.getItem('criticalAudio');
    const savedWarningAudio = localStorage.getItem('warningAudio');
    try {
      if (savedPanels) setPanels(JSON.parse(savedPanels));
      if (savedAlerts) setAlerts(JSON.parse(savedAlerts));
      if (savedRules) setRules(JSON.parse(savedRules));
      if (savedCriticalAudio) setCriticalAudio(savedCriticalAudio);
      if (savedWarningAudio) setWarningAudio(savedWarningAudio);
      document.documentElement.setAttribute('data-bs-theme', theme);
    } catch (error) {
      console.error('Failed to load localStorage data:', error);
      localStorage.removeItem('panels');
      localStorage.removeItem('alerts');
      localStorage.removeItem('rules');
      localStorage.removeItem('criticalAudio');
      localStorage.removeItem('warningAudio');
    }
  }, [theme]);

  // Save data to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('panels', JSON.stringify(panels));
      localStorage.setItem('alerts', JSON.stringify(alerts));
      localStorage.setItem('rules', JSON.stringify(rules));
      localStorage.setItem('theme', theme);
      if (criticalAudio) localStorage.setItem('criticalAudio', criticalAudio);
      if (warningAudio) localStorage.setItem('warningAudio', warningAudio);
      document.documentElement.setAttribute('data-bs-theme', theme);
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }, [panels, alerts, rules, theme, criticalAudio, warningAudio]);

  // Handle CSV file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          processData(result.data);
        },
        error: (error) => {
          alert('Error parsing CSV file: ' + error.message);
        },
      });
    }
  };

  // Handle pasted CSV data
  const handlePasteSubmit = () => {
    if (!inputData.trim()) {
      alert('Please paste CSV data to analyze.');
      return;
    }
    Papa.parse(inputData, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        processData(result.data);
      },
      error: (error) => {
        alert('Error parsing pasted CSV: ' + error.message);
      },
    });
  };

  // Process CSV data and generate alerts
  const processData = (data) => {
    let tempId = 0;
    const parsedData = data
      .filter(row => row.id_panel && row.power && row.voltage && row.timestamp)
      .map(row => {
        const power = parseFloat(row.power);
        const voltage = parseFloat(row.voltage);
        const timestamp = new Date(row.timestamp);

        let status = 'normal';
        if (isNaN(power) || power === 0) {
          status = 'offline';
          playTheftAlertSound();
        } else if (power < powerThreshold) {
          status = 'low';
          playWarningAlertSound();
        }

        return {
          _id: Date.now() + tempId++,
          id_panel: row.id_panel,
          powerOut: !isNaN(power) ? power : 0,
          voltage: !isNaN(voltage) ? voltage : 0,
          panelStatus: status,
          when: isNaN(timestamp.getTime()) ? new Date() : timestamp,
        };
      });

    setPanels(parsedData);

    const powerOutputs = parsedData
      .map(p => p.powerOut)
      .filter(val => !isNaN(val) && val > 0);
    const meanPower = powerOutputs.length > 0
      ? powerOutputs.reduce((sum, val) => sum + val, 0) / powerOutputs.length
      : 0;
    const stdDevPower = powerOutputs.length > 0
      ? Math.sqrt(powerOutputs.reduce((sum, val) => sum + Math.pow(val - meanPower, 2), 0) / powerOutputs.length)
      : 0;

    const newAlerts = parsedData
      .map(p => {
        const alerts = [];
        // Default rules
        if (p.panelStatus === 'offline') {
          alerts.push({
            _id: Date.now() + tempId++,
            id_panel: p.id_panel,
            alertMessage: `Panel ${p.id_panel} is offline: Potential theft detected`,
            severityLevel: 'critical',
            when: p.when,
          });
        } else if (p.panelStatus === 'low') {
          alerts.push({
            _id: Date.now() + tempId++,
            id_panel: p.id_panel,
            alertMessage: `Panel ${p.id_panel} has low power: ${p.powerOut.toFixed(2)}W`,
            severityLevel: 'warning',
            when: p.when,
          });
        }
        if (p.voltage < voltageThreshold) {
          alerts.push({
            _id: Date.now() + tempId++,
            id_panel: p.id_panel,
            alertMessage: `Panel ${p.id_panel} has low voltage: ${p.voltage.toFixed(2)}V`,
            severityLevel: 'warning',
            when: p.when,
          });
          playWarningAlertSound();
        }
        if (meanPower > 0 && stdDevPower > 0 && Math.abs(p.powerOut - meanPower) > 2 * stdDevPower) {
          alerts.push({
            _id: Date.now() + tempId++,
            id_panel: p.id_panel,
            alertMessage: `Anomaly in ${p.id_panel}: Power ${p.powerOut.toFixed(2)}W deviates significantly`,
            severityLevel: 'warning',
            when: p.when,
          });
          playWarningAlertSound();
        }
        // Custom rules
        rules.forEach(rule => {
          const value = rule.metric === 'power' ? p.powerOut : p.voltage;
          let conditionMet = false;
          if (rule.condition === '<' && value < parseFloat(rule.value)) conditionMet = true;
          else if (rule.condition === '>' && value > parseFloat(rule.value)) conditionMet = true;
          else if (rule.condition === '=' && value === parseFloat(rule.value)) conditionMet = true;
          if (conditionMet) {
            alerts.push({
              _id: Date.now() + tempId++,
              id_panel: p.id_panel,
              alertMessage: rule.message || `Custom alert: ${rule.metric} ${rule.condition} ${rule.value}`,
              severityLevel: rule.severity,
              when: p.when,
            });
            rule.severity === 'critical' ? playTheftAlertSound() : playWarningAlertSound();
          }
        });
        return alerts;
      })
      .flat();

    setAlerts(newAlerts);
    console.log('Processed Data:', parsedData, 'Alerts:', newAlerts, 'Rules:', rules);
  };

  // Handle audio file upload
  const handleAudioUpload = (event, type) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      alert('Please upload a valid audio file (MP3, WAV, OGG).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert('File size exceeds 5MB limit.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result;
      if (type === 'critical') {
        setCriticalAudio(base64);
        setCriticalFileName(file.name);
      } else {
        setWarningAudio(base64);
        setWarningFileName(file.name);
      }
    };
    reader.onerror = () => alert('Error reading audio file.');
    reader.readAsDataURL(file);
  };

  // Clear audio file
  const clearAudio = (type) => {
    if (type === 'critical') {
      setCriticalAudio(null);
      setCriticalFileName('Default (880 Hz)');
      localStorage.removeItem('criticalAudio');
    } else {
      setWarningAudio(null);
      setWarningFileName('Default (440 Hz)');
      localStorage.removeItem('warningAudio');
    }
  };

  // Play audio alerts
  const playTheftAlertSound = () => {
    if (criticalAudio) {
      const audio = new Audio(criticalAudio);
      audio.play().catch(error => {
        console.error('Error playing custom critical audio:', error);
        playDefaultTheftSound();
      });
    } else {
      playDefaultTheftSound();
    }
  };

  const playWarningAlertSound = () => {
    if (warningAudio) {
      const audio = new Audio(warningAudio);
      audio.play().catch(error => {
        console.error('Error playing custom warning audio:', error);
        playDefaultWarningSound();
      });
    } else {
      playDefaultWarningSound();
    }
  };

  // Default synthesized sounds
  const playDefaultTheftSound = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.5);
  };

  const playDefaultWarningSound = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, ctx.currentTime);
    oscillator.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.3);
  };

  // Toggle theme
  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  // Clear all data
  const clearData = () => {
    setPanels([]);
    setAlerts([]);
    setRules([]);
    setInputData('');
    setSelectedPanel('All');
    setSelectedSeverity('All');
    setCriticalAudio(null);
    setWarningAudio(null);
    setCriticalFileName('Default (880 Hz)');
    setWarningFileName('Default (440 Hz)');
    localStorage.removeItem('panels');
    localStorage.removeItem('alerts');
    localStorage.removeItem('rules');
    localStorage.removeItem('criticalAudio');
    localStorage.removeItem('warningAudio');
    console.log('Data cleared');
  };

  // Export alerts to CSV
  const exportAlerts = () => {
    const csv = Papa.unparse(alerts, {
      columns: ['id_panel', 'alertMessage', 'severityLevel', 'when'],
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'alerts_export.csv');
    link.click();
    URL.revokeObjectURL(url);
  };

  // Dismiss an alert
  const dismissAlert = (alertId) => {
    setAlerts(alerts.filter(a => a._id !== alertId));
    setSelectedAlert(null);
  };

  // Handle rule form changes
  const handleRuleChange = (e) => {
    const { name, value } = e.target;
    setRuleForm({ ...ruleForm, [name]: value });
  };

  // Add or update a rule
  const saveRule = () => {
    if (!ruleForm.value || isNaN(parseFloat(ruleForm.value)) || !ruleForm.message) {
      alert('Please enter a valid number for value and a message.');
      return;
    }
    const newRule = {
      _id: ruleForm.editId || Date.now(),
      metric: ruleForm.metric,
      condition: ruleForm.condition,
      value: parseFloat(ruleForm.value),
      severity: ruleForm.severity,
      message: ruleForm.message,
    };
    if (ruleForm.editId) {
      setRules(rules.map(r => (r._id === ruleForm.editId ? newRule : r)));
    } else {
      setRules([...rules, newRule]);
    }
    setRuleForm({ metric: 'power', condition: '<', value: '', severity: 'warning', message: '', editId: null });
  };

  // Edit a rule
  const editRule = (rule) => {
    setRuleForm({
      metric: rule.metric,
      condition: rule.condition,
      value: rule.value,
      severity: rule.severity,
      message: rule.message,
      editId: rule._id,
    });
  };

  // Delete a rule
  const deleteRule = (ruleId) => {
    setRules(rules.filter(r => r._id !== ruleId));
  };

  // Dashboard stats
  const totalPanels = panels.length;
  const activePanels = panels.filter(p => p.panelStatus === 'normal').length;
  const offlinePanels = panels.filter(p => p.panelStatus === 'offline').length;
  const avgPower = panels.length > 0
    ? panels.reduce((sum, p) => sum + p.powerOut, 0) / panels.length
    : 0;

  // Filter panels and alerts
  const panelIds = ['All', ...new Set(panels.map(p => p.id_panel).filter(id => id))];
  const filteredPanels = selectedPanel === 'All'
    ? panels
    : panels.filter(p => p.id_panel === selectedPanel);
  const filteredAlerts = selectedSeverity === 'All'
    ? alerts.filter(a => selectedPanel === 'All' || a.id_panel === selectedPanel)
    : alerts.filter(a => a.severityLevel === selectedSeverity && (selectedPanel === 'All' || a.id_panel === selectedPanel));

  // Chart configuration
  const chartData = {
    labels: filteredPanels.map(p => p.when.toLocaleTimeString()),
    datasets: [
      {
        label: `Power Output (W) - ${selectedPanel}`,
        data: filteredPanels.map(p => p.powerOut),
        borderColor: '#0d6efd',
        backgroundColor: 'rgba(13, 110, 253, 0.1)',
        fill: true,
      },
      {
        label: 'Alerts',
        data: filteredPanels.map((p, index) =>
          alerts.some(a => a.id_panel === p.id_panel && a.when.toLocaleTimeString() === p.when.toLocaleTimeString())
            ? p.powerOut
            : null
        ),
        pointBackgroundColor: 'red',
        pointRadius: 6,
        pointStyle: 'circle',
        showLine: false,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Power Output Over Time' },
    },
    scales: {
      y: { beginAtZero: true, title: { display: true, text: 'Power Output (W)' } },
      x: { title: { display: true, text: 'Timestamp' } },
    },
  };

  // Enable Bootstrap tooltips
  useEffect(() => {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.forEach(tooltipTriggerEl => {
      new window.bootstrap.Tooltip(tooltipTriggerEl);
    });
  }, [filteredPanels, filteredAlerts]);

  return (
    <div className="container-fluid py-4 min-vh-100">
      <div className="d-flex justify-content-between align-items-center mb-5">
        <h1 className="display-4 animate__animated animate__pulse fw-bolder">
          Solar PV Security Dashboard
        </h1>
        <button
          className="btn btn-outline-secondary"
          onClick={toggleTheme}
          data-bs-toggle="tooltip"
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? '🌙 Dark' : '☀ Light'}
        </button>
      </div>

      {/* Dashboard Overview */}
      <div className="row g-4 mb-5">
        <div className="col-md-3">
          <div className="card shadow animate__animated animate__fadeIn">
            <div className="card-body text-center">
              <h5 className="card-title">Total Panels</h5>
              <p className="display-6 animate__animated animate__flipInX">{totalPanels}</p>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card shadow animate__animated animate__fadeIn">
            <div className="card-body text-center">
              <h5 className="card-title">Active Panels</h5>
              <p className="display-6 animate__animated animate__flipInX">{activePanels}</p>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card shadow animate__animated animate__fadeIn">
            <div className="card-body text-center">
              <h5 className="card-title">Offline Panels</h5>
              <p className="display-6 text-danger animate__animated animate__flipInX">{offlinePanels}</p>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card shadow animate__animated animate__fadeIn">
            <div className="card-body text-center">
              <h5 className="card-title">Average Power (W)</h5>
              <p className="display-6 animate__animated animate__flipInX">{avgPower.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="card shadow mb-5 animate__animated animate__fadeIn">
        <div className="card-body">
          <h2 className="card-title h4 mb-4">Control Panel</h2>
          <p className="text-muted mb-4">
            Upload or paste CSV data with columns: <strong>id_panel,power,voltage,timestamp</strong>. Example:
            <pre className="bg-light p-3 rounded">
              id_panel,power,voltage,timestamp
              PV001,500.0,220.5,2025-07-20 10:00:00
              PV001,480.0,219.8,2025-07-20 10:10:00
              PV001,200.0,210.0,2025-07-20 10:20:00
            </pre>
          </p>
          <div className="mb-4">
            <label className="form-label">Paste CSV Data:</label>
            <textarea
              className="form-control"
              rows="5"
              placeholder="Paste your CSV data here..."
              value={inputData}
              onChange={(e) => setInputData(e.target.value)}
            ></textarea>
          </div>
          <div className="row g-3 align-items-end mb-4">
            <div className="col-md-3">
              <label className="form-label">Upload CSV File:</label>
              <input
                type="file"
                accept=".csv"
                className="form-control"
                onChange={handleFileUpload}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label">Power Threshold (W):</label>
              <input
                type="number"
                className="form-control"
                value={powerThreshold}
                onChange={(e) => setPowerThreshold(parseFloat(e.target.value) || 50)}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label">Voltage Threshold (V):</label>
              <input
                type="number"
                className="form-control"
                value={voltageThreshold}
                onChange={(e) => setVoltageThreshold(parseFloat(e.target.value) || 200)}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label">Select Panel:</label>
              <select
                className="form-select"
                value={selectedPanel}
                onChange={(e) => setSelectedPanel(e.target.value)}
              >
                {panelIds.map(id => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <button
                className="btn btn-primary me-2"
                onClick={handlePasteSubmit}
              >
                Analyze Data
              </button>
              <button
                className="btn btn-danger"
                onClick={clearData}
              >
                Clear Data
              </button>
            </div>
          </div>

          {/* Custom Alarm Rules */}
          <div className="mt-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="h5 mb-0">Custom Alarm Rules</h3>
              <button
                className="btn btn-primary"
                data-bs-toggle="modal"
                data-bs-target="#ruleModal"
                onClick={() => setRuleForm({ metric: 'power', condition: '<', value: '', severity: 'warning', message: '', editId: null })}
              >
                Add Rule
              </button>
            </div>
            <div className="table-responsive">
              <table className="table table-striped table-hover">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Condition</th>
                    <th>Value</th>
                    <th>Severity</th>
                    <th>Message</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(rule => (
                    <tr key={rule._id}>
                      <td>{rule.metric}</td>
                      <td>{rule.condition}</td>
                      <td>{rule.value}</td>
                      <td className={rule.severity === 'critical' ? 'text-danger' : 'text-warning'}>
                        {rule.severity}
                      </td>
                      <td>{rule.message}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-primary me-2"
                          data-bs-toggle="modal"
                          data-bs-target="#ruleModal"
                          onClick={() => editRule(rule)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => deleteRule(rule._id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Custom Alarm Sounds */}
          <div className="mt-4">
            <h3 className="h5 mb-3">Custom Alarm Sounds</h3>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Critical Alarm Sound (e.g., Theft):</label>
                <div className="input-group">
                  <input
                    type="file"
                    accept="audio/*"
                    className="form-control"
                    onChange={(e) => handleAudioUpload(e, 'critical')}
                  />
                  <button
                    className="btn btn-outline-danger"
                    onClick={() => clearAudio('critical')}
                    data-bs-toggle="tooltip"
                    title="Reset to default 880 Hz beep"
                  >
                    Clear
                  </button>
                </div>
                <small className="text-muted">Current: {criticalFileName}</small>
              </div>
              <div className="col-md-6">
                <label className="form-label">Warning Alarm Sound:</label>
                <div className="input-group">
                  <input
                    type="file"
                    accept="audio/*"
                    className="form-control"
                    onChange={(e) => handleAudioUpload(e, 'warning')}
                  />
                  <button
                    className="btn btn-outline-danger"
                    onClick={() => clearAudio('warning')}
                    data-bs-toggle="tooltip"
                    title="Reset to default 440 Hz beep"
                  >
                    Clear
                  </button>
                </div>
                <small className="text-muted">Current: {warningFileName}</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Panels and Alerts */}
      <div className="row g-4">
        {/* Panels Table */}
        <div className="col-lg-6">
          <div className="card shadow animate__animated animate__fadeIn">
            <div className="card-body">
              <h2 className="card-title h4 mb-4">Panels</h2>
              <div className="table-responsive">
                <table className="table table-striped table-hover">
                  <thead>
                    <tr>
                      <th>Panel ID</th>
                      <th>Power (W)</th>
                      <th>Voltage (V)</th>
                      <th>Status</th>
                      <th>Health</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPanels.map(p => (
                      <tr key={p._id}>
                        <td>{p.id_panel}</td>
                        <td>{p.powerOut.toFixed(2)}</td>
                        <td>{p.voltage.toFixed(2)}</td>
                        <td className={
                          p.panelStatus === 'offline' ? 'text-danger' :
                          p.panelStatus === 'low' ? 'text-warning' : 'text-success'
                        }>
                          {p.panelStatus}
                        </td>
                        <td>
                          <div className="progress" style={{ height: '20px' }}>
                            <div
                              className={`progress-bar ${p.panelStatus === 'offline' ? 'bg-danger' : p.panelStatus === 'low' ? 'bg-warning' : 'bg-success'} animate__animated animate__fadeIn`}
                              role="progressbar"
                              style={{ width: `${Math.min((p.powerOut / 600) * 100, 100)}%` }}
                              aria-valuenow={Math.min((p.powerOut / 600) * 100, 100)}
                              aria-valuemin="0"
                              aria-valuemax="100"
                            ></div>
                          </div>
                        </td>
                        <td>{p.when.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Alerts Table */}
        <div className="col-lg-6">
          <div className="card shadow animate__animated animate__fadeIn">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h2 className="card-title h4 mb-0">Alerts</h2>
                <div className="d-flex align-items-center">
                  <select
                    className="form-select me-2"
                    style={{ width: '150px' }}
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value)}
                  >
                    <option value="All">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                  </select>
                  <button
                    className="btn btn-success"
                    onClick={exportAlerts}
                    data-bs-toggle="tooltip"
                    title="Download alerts as CSV"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-striped table-hover">
                  <thead>
                    <tr>
                      <th>Panel ID</th>
                      <th>Message</th>
                      <th>Severity</th>
                      <th>Time</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.map(a => (
                      <tr
                        key={a._id}
                        onClick={() => setSelectedAlert(a)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>{a.id_panel}</td>
                        <td>{a.alertMessage}</td>
                        <td className={
                          a.severityLevel === 'critical' ? 'text-danger' : 'text-warning'
                        }>
                          {a.severityLevel}
                        </td>
                        <td>{a.when.toLocaleString()}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-outline-primary"
                            data-bs-toggle="modal"
                            data-bs-target="#alertModal"
                            onClick={(e) => { e.stopPropagation(); setSelectedAlert(a); }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {filteredPanels.length > 0 && (
        <div className="card shadow mt-4 animate__animated animate__fadeIn">
          <div className="card-body">
            <h2 className="card-title h4 mb-4">Power Trend</h2>
            <div className="chart-container">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>
      )}

      {/* About Section */}
      <div className="card shadow mt-4 animate__animated animate__fadeIn">
        <div className="card-body">
          <h2 className="card-title h4 mb-4">About This System</h2>
          <p className="text-muted">
            This Solar PV Security Dashboard monitors photovoltaic systems for faults, cyber-attacks, and potential theft. Key features include:
            <ul className="list-group list-group-flush mt-2">
              <li className="list-group-item">Real-time dashboard with panel statistics.</li>
              <li className="list-group-item">Custom audio alerts for critical (theft) and warning conditions.</li>
              <li className="list-group-item">Customizable alarm rules for power and voltage thresholds.</li>
              <li className="list-group-item">Interactive modal for alert details and dismissal.</li>
              <li className="list-group-item">Dark/light mode toggle for user comfort.</li>
              <li className="list-group-item">Export alerts to CSV for reporting.</li>
              <li className="list-group-item">Animated progress bars for panel health.</li>
            </ul>
            Built with React and Bootstrap 5, this system supports smart protection strategies for solar PV systems.
          </p>
        </div>
      </div>

      {/* Alert Details Modal */}
      {selectedAlert && (
        <div className="modal fade" id="alertModal" tabIndex="-1" aria-labelledby="alertModalLabel" aria-hidden="true">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="alertModalLabel">Alert Details</h5>
                <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div className="modal-body">
                <p><strong>Panel ID:</strong> {selectedAlert.id_panel}</p>
                <p><strong>Message:</strong> {selectedAlert.alertMessage}</p>
                <p><strong>Severity:</strong> {selectedAlert.severityLevel}</p>
                <p><strong>Time:</strong> {selectedAlert.when.toLocaleString()}</p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => dismissAlert(selectedAlert._id)}
                  data-bs-dismiss="modal"
                >
                  Dismiss Alert
                </button>
                <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rule Configuration Modal */}
      <div className="modal fade" id="ruleModal" tabIndex="-1" aria-labelledby="ruleModalLabel" aria-hidden="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="ruleModalLabel">{ruleForm.editId ? 'Edit Rule' : 'Add Rule'}</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <div className="mb-3">
                <label className="form-label">Metric:</label>
                <select
                  className="form-select"
                  name="metric"
                  value={ruleForm.metric}
                  onChange={handleRuleChange}
                >
                  <option value="power">Power (W)</option>
                  <option value="voltage">Voltage (V)</option>
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">Condition:</label>
                <select
                  className="form-select"
                  name="condition"
                  value={ruleForm.condition}
                  onChange={handleRuleChange}
                >
                  <option value="<">Less than</option>
                  <option value=">">Greater than</option>
                  <option value="=">Equal to</option>
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">Value:</label>
                <input
                  type="number"
                  className="form-control"
                  name="value"
                  value={ruleForm.value}
                  onChange={handleRuleChange}
                  placeholder="Enter value (e.g., 100)"
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Severity:</label>
                <select
                  className="form-select"
                  name="severity"
                  value={ruleForm.severity}
                  onChange={handleRuleChange}
                >
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="mb-3">
                <label className="form-label">Message:</label>
                <input
                  type="text"
                  className="form-control"
                  name="message"
                  value={ruleForm.message}
                  onChange={handleRuleChange}
                  placeholder="e.g., Critical low power detected"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveRule}
                data-bs-dismiss="modal"
              >
                Save Rule
              </button>
              <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
