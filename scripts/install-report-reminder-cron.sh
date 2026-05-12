#!/usr/bin/env bash
#
# PSO Aurora Report Reminder Cron Installer
#
# One-line installer:
# bash <(curl -fsSL https://raw.githubusercontent.com/jeypsantiago/psoaurora-latest/main/scripts/install-report-reminder-cron.sh)
#
# Local usage:
# bash scripts/install-report-reminder-cron.sh

set -euo pipefail

INSTALLER_URL="https://raw.githubusercontent.com/jeypsantiago/psoaurora-latest/main/scripts/install-report-reminder-cron.sh"
WRAPPER_PATH="/usr/local/bin/pso-report-reminders.sh"
LOG_DIR="/var/log/psoaurora"
LOG_PATH="$LOG_DIR/report-reminders.log"
CRON_BEGIN="# BEGIN PSO AURORA REPORT REMINDERS"
CRON_END="# END PSO AURORA REPORT REMINDERS"
APP_WORKDIR="/app"
REMINDER_CHECK_PATH="/app/scripts/send-report-reminders.mjs"

say() {
  printf '%s\n' "$*" >&2
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

prompt() {
  local message="$1"
  local default_value="${2-}"
  local reply
  if [[ -n "$default_value" ]]; then
    read -r -p "$message [$default_value]: " reply
    printf '%s' "${reply:-$default_value}"
  else
    read -r -p "$message: " reply
    printf '%s' "$reply"
  fi
}

confirm() {
  local message="$1"
  local default_value="${2:-Y}"
  local suffix="[Y/n]"
  [[ "$default_value" == "N" ]] && suffix="[y/N]"
  local reply
  read -r -p "$message $suffix " reply
  reply="${reply:-$default_value}"
  [[ "$reply" =~ ^[Yy]$ ]]
}

normalize_frequency_label() {
  case "$1" in
    "0 * * * *") printf '%s' "Every hour" ;;
    "0 8 * * *") printf '%s' "Daily at 8:00 AM" ;;
    *) printf '%s' "$1" ;;
  esac
}

validate_cron_field() {
  local field="$1"
  [[ "$field" =~ ^[0-9*/,\ -]+$ ]]
}

validate_cron_expression() {
  local expression="$1"
  local fields=()
  read -r -a fields <<< "$expression"
  [[ "${#fields[@]}" -eq 5 ]] || return 1
  local field
  for field in "${fields[@]}"; do
    validate_cron_field "$field" || return 1
  done
}

select_container() {
  local candidates=()
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    if docker exec "$name" sh -lc "test -f '$REMINDER_CHECK_PATH'" >/dev/null 2>&1; then
      candidates+=("$name")
    fi
  done < <(docker ps --format '{{.Names}}')

  if [[ "${#candidates[@]}" -eq 1 ]]; then
    say "Detected app container: ${candidates[0]}"
    if confirm "Use this container?" "Y"; then
      printf '%s' "${candidates[0]}"
      return
    fi
  fi

  if [[ "${#candidates[@]}" -gt 1 ]]; then
    say "Detected multiple candidate containers:"
    local i
    for i in "${!candidates[@]}"; do
      printf '  %d) %s\n' "$((i + 1))" "${candidates[$i]}"
    done
    while true; do
      local choice
      choice="$(prompt "Select container number")"
      [[ "$choice" =~ ^[0-9]+$ ]] || { say "Enter a number."; continue; }
      if (( choice >= 1 && choice <= ${#candidates[@]} )); then
        printf '%s' "${candidates[$((choice - 1))]}"
        return
      fi
      say "Choice out of range."
    done
  fi

  say "No container was auto-detected."
  while true; do
    local manual_name
    manual_name="$(prompt "Enter the web app container name manually")"
    [[ -n "$manual_name" ]] || { say "Container name is required."; continue; }
    if docker exec "$manual_name" sh -lc "test -f '$REMINDER_CHECK_PATH'" >/dev/null 2>&1; then
      printf '%s' "$manual_name"
      return
    fi
    say "Container '$manual_name' does not contain $REMINDER_CHECK_PATH."
  done
}

select_schedule() {
  say ""
  say "Reminder schedule options:"
  say "  1) Every hour (recommended)"
  say "  2) Daily at 8:00 AM"
  say "  3) Every N hours"
  say "  4) Custom cron expression"

  while true; do
    local choice
    choice="$(prompt "Choose schedule option" "1")"
    case "$choice" in
      1) printf '%s' "0 * * * *"; return ;;
      2) printf '%s' "0 8 * * *"; return ;;
      3)
        while true; do
          local interval
          interval="$(prompt "Run every how many hours?" "2")"
          [[ "$interval" =~ ^[0-9]+$ ]] || { say "Enter a whole number."; continue; }
          (( interval >= 1 && interval <= 23 )) || { say "Use a value between 1 and 23."; continue; }
          if (( interval == 1 )); then
            printf '%s' "0 * * * *"
          else
            printf '%s' "0 */$interval * * *"
          fi
          return
        done
        ;;
      4)
        while true; do
          local custom_expression
          custom_expression="$(prompt "Enter cron expression (five fields)")"
          validate_cron_expression "$custom_expression" || {
            say "Invalid cron expression format. Example: 0 8 * * *"
            continue
          }
          printf '%s' "$custom_expression"
          return
        done
        ;;
      *)
        say "Choose 1, 2, 3, or 4."
        ;;
    esac
  done
}

install_wrapper() {
  local container_name="$1"
  apply_wrapper_patch "$container_name"
  chmod +x "$WRAPPER_PATH"
}

apply_wrapper_patch() {
  local container_name="$1"
  local script_contents
  script_contents=$(cat <<EOF
#!/usr/bin/env bash
set -euo pipefail

APP_CONTAINER="$container_name"
APP_WORKDIR="$APP_WORKDIR"

echo "[\$(date -Is)] Running PSO Aurora report reminders"
docker exec "\$APP_CONTAINER" sh -lc "cd '\$APP_WORKDIR' && npm run reports:reminders"
echo "[\$(date -Is)] Done"
EOF
)
  printf '%s\n' "$script_contents" > "$WRAPPER_PATH"
}

install_cron_block() {
  local cron_expression="$1"
  local temp_file
  temp_file="$(mktemp)"
  crontab -l 2>/dev/null | awk -v begin="$CRON_BEGIN" -v end="$CRON_END" '
    $0 == begin { skipping = 1; next }
    $0 == end { skipping = 0; next }
    !skipping { print }
  ' > "$temp_file"

  {
    printf '%s\n' "$CRON_BEGIN"
    printf '%s %s >> %s 2>&1\n' "$cron_expression" "$WRAPPER_PATH" "$LOG_PATH"
    printf '%s\n' "$CRON_END"
  } >> "$temp_file"

  crontab "$temp_file"
  rm -f "$temp_file"
}

print_summary() {
  local container_name="$1"
  local cron_expression="$2"
  say ""
  say "Installation complete."
  say "Container: $container_name"
  say "Wrapper: $WRAPPER_PATH"
  say "Schedule: $(normalize_frequency_label "$cron_expression")"
  say "Cron: $cron_expression"
  say "Log file: $LOG_PATH"
  say ""
  say "Manual run:"
  say "  $WRAPPER_PATH"
  say "View logs:"
  say "  tail -n 100 $LOG_PATH"
  say "Check crontab:"
  say "  crontab -l"
  say ""
  say "Installer command:"
  say "  bash <(curl -fsSL $INSTALLER_URL)"
  say ""
  say "Reminder: enable email reminders in the app UI:"
  say "  Settings > Report Monitoring > Email reminders"
}

main() {
  [[ "$(id -u)" -eq 0 ]] || fail "Run this installer as root."
  require_command bash
  require_command docker
  require_command crontab
  require_command awk
  require_command mktemp

  if command -v systemctl >/dev/null 2>&1 && ! systemctl list-unit-files cron.service >/dev/null 2>&1 && ! systemctl list-unit-files crond.service >/dev/null 2>&1; then
    say "Cron service unit was not detected. Continuing because crontab is installed."
  fi

  mkdir -p "$LOG_DIR"
  touch "$LOG_PATH"

  say "PSO Aurora report reminder cron installer"
  say "Installer command: bash <(curl -fsSL $INSTALLER_URL)"
  say ""

  local container_name
  container_name="$(select_container)"
  say "Selected container: $container_name"

  local cron_expression
  cron_expression="$(select_schedule)"
  say "Selected schedule: $(normalize_frequency_label "$cron_expression")"

  install_wrapper "$container_name"
  install_cron_block "$cron_expression"

  if confirm "Run the reminder wrapper now to verify installation?" "Y"; then
    "$WRAPPER_PATH" || fail "Wrapper test failed."
  fi

  print_summary "$container_name" "$cron_expression"
}

main "$@"
