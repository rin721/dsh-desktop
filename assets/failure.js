const parameters = new URLSearchParams(window.location.search)
const code = parameters.get('code')
const message = parameters.get('message')

if (code !== null) document.querySelector('#code').textContent = code
if (message !== null) document.querySelector('#message').textContent = message

document.querySelector('#retry').addEventListener('click', () => {
  window.location.href = 'dsh-desktop://retry'
})
document.querySelector('#exit').addEventListener('click', () => {
  window.location.href = 'dsh-desktop://exit'
})
