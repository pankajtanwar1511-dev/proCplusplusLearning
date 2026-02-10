# Troubleshooting Guide

## Problem: "Port already in use" after stopping

### Why it happens:
- Python and Node.js spawn child processes
- The old `STOP_APP.sh` only killed parent processes
- Child processes keep ports occupied

### Solution (Now Fixed!):
The new `STOP_APP.sh` kills entire process trees.

---

## Quick Reference

### Normal Operation
```bash
./START_APP.sh    # Start servers
./STOP_APP.sh     # Stop servers (now kills all child processes)
```

### Emergency Stop
If `STOP_APP.sh` doesn't work:
```bash
./KILL_ALL.sh     # Nuclear option - kills everything
```

### Manual Port Clearing
```bash
# Check what's using ports
lsof -i:5000
lsof -i:3000

# Kill specific port
lsof -ti:5000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### Check Running Processes
```bash
# Find Python backends
pgrep -af "python.*app_v2"

# Find React frontends
pgrep -af "react-scripts"

# Check ports
lsof -i:5000 -i:3000
```

---

## Common Issues

### Issue 1: Port 5000 busy after stop
**Cause:** Python backend child processes
**Fix:**
```bash
./KILL_ALL.sh
# or
pkill -9 -f "python.*app_v2.py"
lsof -ti:5000 | xargs kill -9
```

### Issue 2: Port 3000 busy after stop
**Cause:** React development server child processes
**Fix:**
```bash
./KILL_ALL.sh
# or
pkill -9 -f "react-scripts"
lsof -ti:3000 | xargs kill -9
```

### Issue 3: Can't start even after KILL_ALL
**Check:**
```bash
# Verify ports are free
lsof -i:5000
lsof -i:3000

# If still showing processes
sudo lsof -i:5000
sudo lsof -i:3000

# Force kill with sudo
sudo kill -9 $(sudo lsof -ti:5000)
sudo kill -9 $(sudo lsof -ti:3000)
```

### Issue 4: Permission denied
**Fix:**
```bash
chmod +x *.sh
```

---

## Updated Scripts

### STOP_APP.sh (New Features)
✅ Kills entire process tree (parent + children)
✅ Checks ports directly
✅ Force kills stubborn processes
✅ Verifies ports are free
✅ Cleans up PID files

### KILL_ALL.sh (Emergency)
🚨 Nuclear option
✅ Force kills everything (-9 signal)
✅ No mercy for child processes
✅ Clears all PID files

---

## Best Practices

### Starting the App
```bash
# 1. Make sure ports are free first
./STOP_APP.sh

# 2. Start fresh
./START_APP.sh
```

### Stopping the App
```bash
# Normal stop (use this)
./STOP_APP.sh

# If that fails (emergency)
./KILL_ALL.sh
```

### Development Workflow
```bash
# Stop → Make changes → Start
./STOP_APP.sh
# ... edit code ...
./START_APP.sh
```

---

## How the Fix Works

### Old STOP_APP.sh (Broken)
```bash
kill $PID    # Only kills parent
# Child processes remain and hold ports
```

### New STOP_APP.sh (Fixed)
```bash
# 1. Kill by PID files (with process tree)
kill_tree $PID    # Kills parent + all children

# 2. Kill by port numbers
lsof -ti:5000 | xargs kill -9

# 3. Kill by process name
pkill -f "app_v2.py"
pkill -f "react-scripts"

# 4. Verify ports are free
```

---

## Debugging Commands

### See what's running
```bash
# Backend processes
ps aux | grep app_v2

# Frontend processes
ps aux | grep react-scripts

# All Node processes
ps aux | grep node

# Check ports in detail
sudo netstat -tulpn | grep -E ':(5000|3000)'
```

### Process tree
```bash
# See parent-child relationships
pstree -p $(pgrep -f app_v2)
pstree -p $(pgrep -f react-scripts)
```

---

## Prevention

### Always use scripts
✅ `./START_APP.sh` (not `npm start` directly)
✅ `./STOP_APP.sh` (not `Ctrl+C`)

### Why?
- Scripts track PIDs properly
- Ensure clean shutdown
- Handle child processes
- Verify ports are freed

---

## Quick Commands Cheat Sheet

```bash
# Start/Stop (normal)
./START_APP.sh
./STOP_APP.sh

# Emergency stop
./KILL_ALL.sh

# Check if running
lsof -i:5000 -i:3000

# Kill specific port
lsof -ti:5000 | xargs kill -9   # Backend
lsof -ti:3000 | xargs kill -9   # Frontend

# Check logs
tail -f backend.log
tail -f frontend.log

# Clean restart
./STOP_APP.sh && sleep 2 && ./START_APP.sh
```

---

## Files Changed

✅ `STOP_APP.sh` - Updated with process tree killing
✅ `KILL_ALL.sh` - New emergency stop script
✅ `TROUBLESHOOTING.md` - This guide

---

## Summary

**Problem:** Child processes kept ports busy
**Solution:** New scripts kill entire process trees
**Emergency:** Use `./KILL_ALL.sh` if needed

**Now your scripts work perfectly!** 🎉
