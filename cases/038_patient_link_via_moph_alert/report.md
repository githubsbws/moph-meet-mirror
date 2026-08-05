# Deliver patient room links through MOPH Alert

## Scope

- Patient: enter a 13-digit CID, then deliver the patient queue link in a MOPH Alert message.
- Provider: keep the provider meeting link available for copy only.

## Delivered

- Creating an exam room with a patient and inviting a patient from the exam room both send the patient-specific queue link through MOPH Alert.
- These authenticated app APIs no longer return a patient URL. They return `patientNotification` with the delivery outcome instead.
- Web and mobile screens show the delivery outcome rather than a patient link or copy action.
- If delivery fails, the staff can re-enter the same CID and send again. The retry verifies it against the invitation's existing CID hash and rejects expired invitations.
- Automatic LINE and MOPH Alert notifications for provider meeting links were removed. `meetJoinUrl` remains available for the provider/coordinator to copy.

## Configuration

No environment variable was added. The flow uses the existing `MOPH_ALERT_*` configuration and requires the room owner's existing five-digit H-Code.

## Out of scope

The unauthenticated external compatibility endpoint `POST /api/meet/reserved/token` is unchanged because it is outside the authenticated web/mobile invitation flow.
