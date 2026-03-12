/* PoC app.js
   - Creates a Jitsi External API instance when a room is created
   - Supports: random room button, form create/join, and end meeting (hangup)
*/

const btnRandom = document.getElementById('btn-random');
const form = document.getElementById('create-form');
const btnEnd = document.getElementById('btn-end');
const info = document.getElementById('meeting-info');
const container = document.getElementById('jitsi-container');

let api = null;

function makeRandomRoom() {
  const adjectives = ['quick','quiet','bright','calm','kind','safe','brave'];
  const nouns = ['tiger','river','ocean','forest','clinic','doctor','room'];
  const a = adjectives[Math.floor(Math.random()*adjectives.length)];
  const n = nouns[Math.floor(Math.random()*nouns.length)];
  const suffix = Math.floor(Math.random()*10000);
  return `${a}-${n}-${suffix}`;
}

function createMeeting(options = {}){
  // If already have an API instance, hang it up first
  if(api){
    try{ api.dispose(); }catch(e){}
    api = null;
    container.innerHTML = '';
  }

  const domain = options.domain || 'meet.jit.si';
  const roomName = options.roomName || makeRandomRoom();
  const parentNode = container;

  const config = {
    roomName,
    parentNode,
    width: '100%',
    height: 480,
    interfaceConfigOverwrite: { SHOW_JITSI_WATERMARK: false }
  };

  const userInfo = {};
  if(options.displayName) userInfo.displayName = options.displayName;
  if(options.email) userInfo.email = options.email;

  const apiOptions = {
    ...config,
    userInfo
  };

  api = new JitsiMeetExternalAPI(domain, apiOptions);

  info.textContent = `Active meeting: ${roomName}`;
  btnEnd.disabled = false;

  api.addEventListener('readyToClose', () => {
    endMeetingCleanup();
  });
}

function endMeetingCleanup(){
  if(api){
    try{ api.dispose(); }catch(e){}
    api = null;
  }
  container.innerHTML = '';
  info.textContent = 'No active meeting';
  btnEnd.disabled = true;
}

btnRandom.addEventListener('click', () => {
  const room = makeRandomRoom();
  createMeeting({ roomName: room });
});

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const room = document.getElementById('room-name').value.trim();
  const name = document.getElementById('display-name').value.trim();
  const subject = document.getElementById('subject').value.trim();

  if(!room){
    alert('Please provide a room name (or use the random button)');
    return;
  }

  createMeeting({ roomName: room, displayName: name || undefined, subject: subject || undefined });
});

btnEnd.addEventListener('click', () => {
  if(!api){
    endMeetingCleanup();
    return;
  }
  try{
    api.executeCommand('hangup');
  }catch(e){
    console.warn('hangup failed', e);
  }
  // Some clients emit readyToClose; ensure cleanup after a short delay
  setTimeout(endMeetingCleanup, 1000);
});
