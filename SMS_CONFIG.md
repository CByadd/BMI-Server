# SMS Configuration – Route Mobile SMSPLUS Bulk HTTP API

Configuration follows **Route Mobile – SMSPLUS – Bulk HTTP API** (SmsPlus_BulkHttp PDF, Version 1.0.1, January 2018).

## API URL

```
http://<server>:8080/bulksms/bulksms?username=XXXX&password=YYYYY&type=Y&dlr=Z&destination=QQQQQQQQQ&source=RRRR&message=SSSSSSSS
```

All parameters (especially `message` and `url`) must be **URL-UTF-8 encoded**.

## Environment Variables

| Env Variable | Description | Doc Parameter |
|-------------|-------------|---------------|
| `SMS_API_BASE_URL` or `OTP_API_BASE_URL` | Base URL e.g. `http://sms6.rmlconnect.net:8080` | `<server>:8080` |
| `SMS_USERNAME` or `OTP_USERNAME` | HTTP account username | `username` |
| `SMS_PASSWORD` or `OTP_PASSWORD` | HTTP account password | `password` |
| `SMS_SOURCE` or `OTP_SOURCE` | Sender ID (max 18 numeric, max 11 alphanumeric) | `source` |

Optional (OTP): `OTP_LENGTH`, `OTP_EXPIRY`, `OTP_MESSAGE_TEMPLATE`, `OTP_MOCK_MODE`.

Optional (India DLT, not in base spec): `OTP_ENTITY_ID`, `OTP_TEMPLATE_ID` (or `SMS_ENTITY_ID`, `SMS_TEMPLATE_ID`).

Optional: `SMS_DESTINATION_WITH_PLUS=true` to send destination with `+` prefix (URL-encoded as `%2B`).

## Request Parameters (from doc)

| # | Parameter    | Description |
|---|--------------|-------------|
| 1 | username     | HTTP account username |
| 2 | password     | HTTP account password |
| 3 | type         | 0=Plain GSM 3.38, 1=Flash, 2=Unicode, 4=WAP Push, 5=Plain ISO-8859-1, 6=Unicode Flash, 7=Flash ISO-8859-1 |
| 4 | dlr          | 0=No delivery report, 1=Delivery report required |
| 5 | destination  | Mobile number (may include +; multiple comma-separated) |
| 6 | source       | Sender address (max 18 numeric, max 11 alphanumeric) |
| 7 | message      | Message text (URL-UTF-8 encoded) |
| 8 | url          | For WAP Push (type=4) only; URL-UTF-8 encoded |

## Response

- **Success:** `1701|<CELL_NO>|<MESSAGE ID>`
- **Error codes:** 1702 Invalid URL, 1703 Invalid username/password, 1704 Invalid type, 1705 Invalid message, 1706 Invalid destination, 1707 Invalid source, 1708 Invalid dlr, 1709 User validation failed, 1710 Internal error, 1025 Insufficient credit, 1715 Response timeout, 1032 DND reject, 1028 Spam.

Do **not** retry for error 1715 with the same message.
