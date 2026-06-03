'use client';
import Chip from './Chip';

const STATUS_CHIP = {
  confirmed: ['Confirmed', 'neutral'], arrived: ['Arrived', 'amber'], done: ['Done', 'green'],
  no_show: ['No-show', 'red'], late: ['Late', 'red'],
  waiting: ['Waiting', 'neutral'], in_consultation: ['In consult', 'amber'],
  ready_for_checkout: ['Ready', 'teal'], checked_out: ['Checked out', 'green'], urgent: ['Urgent', 'red'],
  planned: ['Planned', 'neutral'], in_progress: ['In progress', 'amber'], completed: ['Completed', 'green'],
  paused: ['Paused', 'neutral'], follow_up: ['Follow-up', 'teal'],
  pending: ['Pending', 'neutral'], sent: ['Sent', 'amber'], received: ['Received', 'teal'],
  active: ['Active', 'amber'], paid: ['Paid', 'green'], partial: ['Partial', 'amber'], unpaid: ['Unpaid', 'orange'],
};
function StatusChip({ status, size }) {
  const [label, tone] = STATUS_CHIP[status] || [status, 'neutral'];
  return <Chip label={label} tone={tone} size={size} />;
}

export { STATUS_CHIP };
export default StatusChip;
