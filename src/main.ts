import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

// Remove a splash screen assim que o app montar
document.getElementById('splash')?.remove()

export default app
