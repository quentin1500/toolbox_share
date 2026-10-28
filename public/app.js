/* global oidc, ToolboxAuth */
(() => {
  'use strict';
  const config = window.APP_CONFIG || {};
  const configured = Boolean(config.authority && config.clientId && config.apiUrl && config.appUrl);
  const $ = selector => document.querySelector(selector);
  const categories = { Percage: 'drill', Decoupe: 'axe', Jardin: 'shovel', Mesure: 'ruler', 'A main': 'hammer', Autre: 'wrench' };
  const categoryLabels = { Percage: 'Perçage', Decoupe: 'Découpe', Jardin: 'Jardin', Mesure: 'Mesure', 'A main': 'À main', Autre: 'Autre' };
  const conditionLabels = { 'Tres bon': 'Très bon', Bon: 'Bon', Usage: 'Usagé' };
  const state = {
    tools: [], friends: { friends: [], sent: [], received: [] }, neighborhoodTools: [],
    profile: { exists: false, name: '', phone: '', address: '' }, profileRequired: false,
    page: 'tools', friendsTab: 'friends', incomingCount: 0, friendIndicatorMoved: false, pendingRequests: 0,
    user: null, manager: null, busy: false, editing: null, deleting: null, removingFriend: null
  };
  const demoTools = [
    { id: 'demo-1', name: 'Perceuse sans fil', category: 'Percage', description: 'Bosch 18 V · 2 batteries et coffret de forets', condition: 'Tres bon', shared: true },
    { id: 'demo-2', name: 'Scie sauteuse', category: 'Decoupe', description: 'Makita · Lames bois et métal incluses', condition: 'Bon', shared: true },
    { id: 'demo-3', name: 'Marteau de menuisier', category: 'A main', description: 'Manche en frêne · 300 g', condition: 'Bon', shared: false },
    { id: 'demo-4', name: 'Bêche de jardin', category: 'Jardin', description: 'Pour préparer les prochaines plantations', condition: 'Usage', shared: true },
    { id: 'demo-5', name: 'Niveau à bulle', category: 'Mesure', description: 'Stanley · 60 cm, 3 fioles', condition: 'Tres bon', shared: true },
    { id: 'demo-6', name: 'Caisse à outils', category: 'Autre', description: 'Les essentiels pour les petits travaux', condition: 'Bon', shared: false }
  ];
  const messages = {
    UNAUTHORIZED: 'Votre session a expiré ou le jeton est invalide. Reconnectez-vous.',
    FORBIDDEN: "Le jeton ne contient pas les droits ou l'e-mail vérifié attendus. Contactez l'administrateur.",
    PROFILE_REQUIRED: 'Créez votre profil pour accéder aux outils.',
    NOT_FOUND: "Cet outil n'existe plus. Actualisez votre inventaire.",
    BAD_REQUEST: 'Les informations saisies ne sont pas valides.',
    BUSY: 'Le service est occupé. Réessayez dans quelques instants.',
    CONFIGURATION: 'La configuration du serveur est incomplète.',
    INTERNAL: 'Le serveur a rencontré une erreur. Réessayez plus tard.'
  };

  function notice(message, error = false) {
    $('#notice').textContent = message;
    $('#notice').classList.toggle('error', error);
    $('#notice').hidden = !message;
  }

  function loadingMessage(action) {
    return {
      list: 'Chargement de votre boîte à outils…',
      getProfile: 'Chargement de votre profil…',
      saveProfile: 'Enregistrement de votre profil…',
      deleteProfile: 'Suppression de votre profil, de vos relations et de vos outils…',
      getFriendStatus: 'Vérification de vos demandes d’ami…',
      listFriends: 'Chargement de vos amis et demandes…',
      listNeighborhoodTools: 'Chargement des outils du quartier…',
      sendFriendRequest: 'Envoi de la demande…',
      respondFriendRequest: 'Mise à jour de la demande…',
      removeFriendship: 'Suppression de la relation…'
    }[action] || 'Mise à jour de votre boîte à outils…';
  }

  function beginRequest(action) {
    state.pendingRequests += 1;
    $('#backend-loading-text').textContent = loadingMessage(action);
    $('#backend-loading').hidden = false;
    $('#outils').setAttribute('aria-busy', 'true');
  }

  function endRequest() {
    state.pendingRequests = Math.max(0, state.pendingRequests - 1);
    const pending = state.pendingRequests > 0;
    $('#backend-loading').hidden = !pending;
    $('#outils').setAttribute('aria-busy', String(pending));
  }

  function canEdit() { return !configured || Boolean(state.user && !state.user.expired && state.profile.exists); }

  function markProfileRequired() {
    state.profile = { exists: false, name: '', phone: '', address: '' };
    state.tools = [];
    state.friends = { friends: [], sent: [], received: [] };
    state.neighborhoodTools = [];
    setIncomingCount(0);
    state.profileRequired = true;
  }

  function setPage(page) {
    state.page = page;
    $('#tools-page').hidden = page !== 'tools';
    $('#profile-page').hidden = page !== 'profile';
    $('#friends-page').hidden = page !== 'friends';
    $('#neighborhood-page').hidden = page !== 'neighborhood';
    const navigation = [
      ['.nav-item', 'tools'], ['#neighborhood-navigation', 'neighborhood']
    ];
    for (const [selector, destination] of navigation) {
      const link = $(selector);
      link.classList.toggle('active', page === destination);
      if (page === destination) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (window.matchMedia('(max-width: 850px)').matches) setSidebarOpen(false);
    if (page === 'profile') $('#profile-title').focus();
    if (page === 'friends') $('#friends-title').focus();
    if (page === 'neighborhood') $('#neighborhood-title').focus();
  }

  function setSidebarOpen(open) {
    const mobile = window.matchMedia('(max-width: 850px)').matches;
    const sidebar = $('#sidebar');
    if (mobile) {
      $('#shell').classList.remove('sidebar-collapsed');
      sidebar.classList.remove('open');
      sidebar.classList.toggle('open', open);
      $('#sidebar-backdrop').hidden = !open;
    } else {
      sidebar.classList.remove('open');
      $('#shell').classList.toggle('sidebar-collapsed', !open);
      $('#sidebar-backdrop').hidden = true;
    }
    $('#sidebar-toggle').setAttribute('aria-expanded', String(open));
  }

  function setBusy(value) {
    state.busy = value;
    $('#tool-grid').setAttribute('aria-busy', String(value));
    ['#save-button', '#confirm-delete', '#refresh-button', '#auth-button', '#account-button', '#profile-button', '#friends-button', '#delete-profile-button', '#logout-button', '#logout-onboarding-button', '#save-profile-button', '#confirm-profile-delete', '#profile-back-button', '#cancel-profile-button', '#add-friend-button', '#friends-refresh-button', '#neighborhood-refresh-button', '#send-friend-request', '#confirm-friend-remove'].forEach(selector => { $(selector).disabled = value; });
    $('#add-button').disabled = value || !canEdit();
    document.querySelectorAll('.edit, .delete').forEach(button => { button.disabled = value; });
    document.querySelectorAll('.friend-actions button').forEach(button => { button.disabled = value; });
    ['#close-dialog', '#cancel-dialog', '#cancel-delete', '#cancel-profile-delete', '#close-friend-request', '#cancel-friend-request', '#cancel-friend-remove'].forEach(selector => { $(selector).disabled = value; });
  }

  function render() {
    const query = $('#search').value.trim().toLocaleLowerCase('fr');
    const category = $('#category-filter').value;
    const sharing = $('#sharing-filter').value;
    const visible = state.tools.filter(tool =>
      (!query || `${tool.name} ${tool.description}`.toLocaleLowerCase('fr').includes(query)) &&
      (!category || tool.category === category) &&
      (!sharing || (sharing === 'shared' ? tool.shared : !tool.shared)));
    $('#total-count').textContent = state.tools.length;
    $('#nav-count').textContent = state.tools.length;
    $('#shared-count').textContent = state.tools.filter(tool => tool.shared).length;
    $('#shared-count-label').textContent = configured ? 'partagés avec mes amis' : 'avec partage prévu';
    $('#sharing-filter').options[1].textContent = configured ? 'Partagés avec mes amis' : 'Partage prévu';
    $('#tool-sharing-label').textContent = configured ? 'Partager cet outil avec mes amis' : 'Prévoir de partager cet outil';
    $('#tool-sharing-help').textContent = configured
      ? 'Vos amis acceptés le verront dans « Les outils du quartier ».'
      : 'Ce choix reste dans la démonstration en mémoire.';
    $('#visible-count').textContent = `${visible.length} outil${visible.length > 1 ? 's' : ''}`;
    $('#tool-grid').replaceChildren();
    for (const tool of visible) {
      const node = $('#tool-template').content.cloneNode(true);
      node.querySelector('h3').textContent = tool.name;
      node.querySelector('.tool-category').textContent = categoryLabels[tool.category] || tool.category;
      node.querySelector('.tool-owner').textContent = '';
      node.querySelector('.tool-description').textContent = tool.description || 'Aucune description';
      node.querySelector('.condition').textContent = `${conditionLabels[tool.condition] || tool.condition} état`;
      node.querySelector('.tool-illustration').src = `assets/icons/${categories[tool.category] || 'wrench'}.svg`;
      const badge = node.querySelector('.sharing-badge');
      badge.textContent = tool.shared ? (configured ? 'Partagé avec mes amis' : 'Partage prévu') : 'Privé';
      badge.classList.toggle('private', !tool.shared);
      const edit = node.querySelector('.edit');
      edit.title = `Modifier ${tool.name}`;
      edit.setAttribute('aria-label', edit.title);
      edit.addEventListener('click', () => openTool(tool));
      const remove = node.querySelector('.delete');
      remove.title = `Supprimer ${tool.name}`;
      remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => {
        state.deleting = tool;
        $('#delete-description').textContent = tool.name;
        $('#delete-error').hidden = true;
        $('#delete-dialog').showModal();
        $('#cancel-delete').focus();
      });
      $('#tool-grid').append(node);
    }
    $('#empty-state').hidden = visible.length > 0;
    $('#empty-title').textContent = state.tools.length ? 'Aucun outil ne correspond.' : 'Votre boîte attend son premier outil.';
    $('#empty-description').textContent = state.tools.length ? 'Essayez une autre recherche ou une autre catégorie.' : 'Ajoutez le matériel que vous avez sous la main.';
    renderFriends();
    renderNeighborhood();
    setBusy(state.busy);
  }

  function setIncomingCount(count) {
    state.incomingCount = count;
    if (count === 0) state.friendIndicatorMoved = false;
    $('#account-notification').hidden = count === 0 || state.friendIndicatorMoved;
    $('#friends-notification').hidden = count === 0;
    $('#received-notification').hidden = count === 0;
    $('#friends-button').setAttribute('aria-label', count
      ? `Mes amis, ${count} demande${count > 1 ? 's' : ''} reçue${count > 1 ? 's' : ''}`
      : 'Mes amis');
    if (count && !state.friendIndicatorMoved) {
      $('#account-button').setAttribute('aria-label', `${$('#account-email').textContent}, nouvelle demande d’ami`);
    } else {
      $('#account-button').removeAttribute('aria-label');
    }
  }

  function renderFriends() {
    const tabs = [
      ['friends', '#friends-tab', '#friend-count'],
      ['sent', '#sent-tab', '#sent-count'],
      ['received', '#received-tab', '#received-count']
    ];
    for (const [tab, button, count] of tabs) {
      $(button).setAttribute('aria-selected', String(state.friendsTab === tab));
      $(count).textContent = state.friends[tab].length;
    }
    $('#friends-list').setAttribute('aria-labelledby', `${state.friendsTab}-tab`);
    $('#friends-list').replaceChildren();
    const entries = state.friends[state.friendsTab];
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'social-empty';
      empty.textContent = {
        friends: 'Vous n’avez pas encore d’ami. Envoyez une demande pour commencer.',
        sent: 'Aucune demande envoyée en attente.',
        received: 'Aucune demande reçue en attente.'
      }[state.friendsTab];
      $('#friends-list').append(empty);
      return;
    }
    for (const entry of entries) {
      const card = document.createElement('article');
      card.className = 'friend-card';
      const title = document.createElement('h2');
      title.textContent = state.friendsTab === 'friends' ? (entry.name || 'Nom non renseigné') : entry.email;
      card.append(title);
      if (state.friendsTab === 'friends') {
        const email = document.createElement('p');
        email.className = 'friend-email';
        email.textContent = entry.email;
        card.append(email);
        for (const [label, value] of [['Téléphone', entry.phone], ['Adresse', entry.address]]) {
          if (!value) continue;
          const detail = document.createElement('p');
          detail.className = 'friend-detail';
          detail.textContent = `${label} : ${value}`;
          card.append(detail);
        }
      }
      if (state.friendsTab === 'received') {
        const actions = document.createElement('div');
        actions.className = 'friend-actions';
        for (const [decision, label, style] of [
          ['accept', 'Accepter', 'primary'], ['decline', 'Refuser', 'secondary']
        ]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = `button ${style}`;
          button.textContent = label;
          button.disabled = state.busy;
          button.addEventListener('click', () => respondToFriendRequest(entry.email, decision));
          actions.append(button);
        }
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'button secondary';
        removeButton.textContent = 'Résilier la demande';
        removeButton.disabled = state.busy;
        removeButton.addEventListener('click', () => openFriendRemoval(entry.email, 'en attente'));
        actions.append(removeButton);
        card.append(actions);
      } else if (state.friendsTab === 'sent') {
        const actions = document.createElement('div');
        actions.className = 'friend-actions';
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'button secondary';
        removeButton.textContent = 'Résilier la demande';
        removeButton.disabled = state.busy;
        removeButton.addEventListener('click', () => openFriendRemoval(entry.email, 'en attente'));
        actions.append(removeButton);
        card.append(actions);
      } else {
        const actions = document.createElement('div');
        actions.className = 'friend-actions';
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'button danger';
        removeButton.textContent = 'Rompre l’amitié';
        removeButton.disabled = state.busy;
        removeButton.addEventListener('click', () => openFriendRemoval(entry.email, 'accepté'));
        actions.append(removeButton);
        card.append(actions);
      }
      $('#friends-list').append(card);
    }
  }

  function renderNeighborhood() {
    const query = $('#neighborhood-search').value.trim().toLocaleLowerCase('fr');
    const category = $('#neighborhood-category').value;
    const condition = $('#neighborhood-condition').value;
    const visible = state.neighborhoodTools.filter(tool =>
      (!query || `${tool.name} ${tool.description} ${tool.ownerName} ${tool.ownerEmail}`.toLocaleLowerCase('fr').includes(query)) &&
      (!category || tool.category === category) &&
      (!condition || tool.condition === condition));
    $('#neighborhood-count').textContent = `${visible.length} outil${visible.length > 1 ? 's' : ''}`;
    $('#neighborhood-grid').replaceChildren();
    for (const tool of visible) {
      const node = $('#tool-template').content.cloneNode(true);
      node.querySelector('h3').textContent = tool.name;
      node.querySelector('.tool-category').textContent = categoryLabels[tool.category] || tool.category;
      node.querySelector('.tool-owner').textContent = `Proposé par ${tool.ownerName || tool.ownerEmail} · ${tool.ownerEmail}`;
      node.querySelector('.tool-description').textContent = tool.description || 'Aucune description';
      node.querySelector('.condition').textContent = `${conditionLabels[tool.condition] || tool.condition} état`;
      node.querySelector('.tool-illustration').src = `assets/icons/${categories[tool.category] || 'wrench'}.svg`;
      node.querySelector('.sharing-badge').textContent = 'Partagé';
      node.querySelector('.tool-actions').hidden = true;
      $('#neighborhood-grid').append(node);
    }
    $('#neighborhood-empty-state').hidden = visible.length > 0;
    $('#neighborhood-empty-title').textContent = state.neighborhoodTools.length && !visible.length
      ? 'Aucun outil ne correspond.'
      : 'Aucun outil partagé pour le moment.';
    $('#neighborhood-empty-description').textContent = state.neighborhoodTools.length && !visible.length
      ? 'Essayez une autre recherche, une autre catégorie ou un autre état.'
      : 'Les outils partagés de vos amis apparaîtront ici.';
  }

  async function request(action, data = {}) {
    if (!state.user || state.user.expired) throw new Error(messages.UNAUTHORIZED);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    beginRequest(action);
    try {
      const response = await fetch(config.apiUrl, {
        method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ ...data, action, accessToken: state.user.access_token }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error('HTTP');
      const result = await response.json();
      if (!result.ok) {
        if (result.error === 'UNAUTHORIZED') await clearSession();
        if (result.error === 'PROFILE_REQUIRED') markProfileRequired();
        throw new Error(messages[result.error] || messages.INTERNAL);
      }
      return result.data;
    } catch (error) {
      if (Object.values(messages).includes(error.message)) throw error;
      if (['list', 'getProfile', 'getFriendStatus', 'listFriends', 'listNeighborhoodTools'].includes(action)) {
        throw new Error('Connexion au serveur impossible. Vérifiez le réseau et le déploiement Apps Script.');
      }
      if (action === 'saveProfile') throw new Error("Enregistrement impossible. Vos informations n'ont peut-être pas été sauvegardées.");
      if (action === 'deleteProfile') throw new Error("La suppression a peut-être été partielle. Vérifiez vos données avant de réessayer.");
      throw new Error("Confirmation impossible. L'action a peut-être abouti : actualisez avant de réessayer.");
    } finally {
      clearTimeout(timer);
      endRequest();
    }
  }

  async function loadTools() {
    if (state.busy) return;
    if (!configured) { render(); return; }
    if (!state.user || !state.profile.exists) return;
    setBusy(true);
    $('#empty-state').hidden = true;
    try {
      const result = await request('list');
      state.tools = result.tools;
      setAccount(result.email);
      notice('');
    } catch (error) {
      if (error.message === messages.PROFILE_REQUIRED) {
        showProfile(state.profile);
        notice(messages.PROFILE_REQUIRED, true);
      } else notice(error.message, true);
    }
    finally { setBusy(false); render(); }
    await refreshFriendStatus();
  }

  async function refreshFriendStatus() {
    if (!configured || !state.user || !state.profile.exists) return;
    try {
      const status = await request('getFriendStatus');
      setIncomingCount(status.incomingCount);
    } catch (error) {
      if (error.message === messages.PROFILE_REQUIRED) showProfile(state.profile);
      notice(error.message, true);
    }
  }

  async function loadFriends(preserveNotice = false) {
    if (state.busy || !state.user || !state.profile.exists) return;
    setBusy(true);
    try {
      state.friends = await request('listFriends');
      setIncomingCount(state.friends.received.length);
      if (!preserveNotice) notice('');
    } catch (error) {
      if (error.message === messages.PROFILE_REQUIRED) showProfile(state.profile);
      notice(error.message, true);
    } finally {
      setBusy(false);
      render();
    }
  }

  async function loadNeighborhoodTools() {
    if (state.busy || !state.user || !state.profile.exists) return;
    setBusy(true);
    try {
      const result = await request('listNeighborhoodTools');
      state.neighborhoodTools = result.tools;
      notice('');
    } catch (error) {
      if (error.message === messages.PROFILE_REQUIRED) showProfile(state.profile);
      notice(error.message, true);
    } finally {
      setBusy(false);
      render();
    }
  }

  async function openFriends() {
    if (state.busy || !state.user || !state.profile.exists) return;
    closeAccountMenu();
    setPage('friends');
    await loadFriends();
  }

  async function openNeighborhood() {
    if (state.busy || !state.user || !state.profile.exists) return;
    closeAccountMenu();
    setPage('neighborhood');
    await loadNeighborhoodTools();
  }

  async function respondToFriendRequest(email, decision) {
    if (state.busy) return;
    setBusy(true);
    try {
      await request('respondFriendRequest', { email, decision });
      if (decision === 'accept') state.friendsTab = 'friends';
      notice(decision === 'accept' ? 'Demande acceptée. Vous êtes maintenant amis.' : 'Demande refusée.');
    } catch (error) {
      if (error.message === messages.PROFILE_REQUIRED) showProfile(state.profile);
      else if (error.message === messages.NOT_FOUND) notice('Cette demande n’est plus disponible. Actualisez la liste.', true);
      else notice(error.message, true);
    } finally {
      setBusy(false);
      render();
    }
    await loadFriends(true);
  }

  function openFriendRemoval(email, status) {
    if (state.busy) return;
    state.removingFriend = { email, status };
    const accepted = status === 'accepté';
    $('#friend-remove-title').textContent = accepted ? 'Rompre cette amitié ?' : 'Résilier cette demande ?';
    $('#friend-remove-description').textContent = accepted
      ? 'Vous et cette personne ne serez plus amis. Vos profils et outils partagés ne seront plus accessibles entre vous.'
      : 'Cette demande sera supprimée et ne pourra plus être acceptée.';
    $('#confirm-friend-remove').textContent = accepted ? 'Rompre l’amitié' : 'Résilier la demande';
    $('#friend-remove-error').hidden = true;
    $('#friend-remove-dialog').showModal();
    $('#cancel-friend-remove').focus();
  }

  async function removeFriendship(event) {
    event.preventDefault();
    if (state.busy || !state.removingFriend) return;
    const { email, status } = state.removingFriend;
    setBusy(true);
    $('#friend-remove-error').hidden = true;
    try {
      await request('removeFriendship', { email });
      $('#friend-remove-dialog').close();
      state.removingFriend = null;
      if (status === 'accepté') state.neighborhoodTools = [];
      notice(status === 'accepté' ? 'L’amitié a été rompue.' : 'La demande a été résiliée.');
    } catch (error) {
      if (error.message === messages.PROFILE_REQUIRED) {
        $('#friend-remove-dialog').close();
        state.removingFriend = null;
        showProfile(state.profile);
      } else if (error.message === messages.NOT_FOUND) {
        $('#friend-remove-dialog').close();
        state.removingFriend = null;
        notice('Cette relation n’est plus disponible. La liste a été actualisée.', true);
      } else {
        $('#friend-remove-error').textContent = error.message;
        $('#friend-remove-error').hidden = false;
      }
    } finally {
      setBusy(false);
      render();
    }
    await loadFriends(true);
  }

  async function sendFriendRequest(event) {
    event.preventDefault();
    if (state.busy) return;
    const email = String(new FormData(event.target).get('email') || '').trim();
    setBusy(true);
    $('#friend-request-error').hidden = true;
    try {
      await request('sendFriendRequest', { email });
      state.friendsTab = 'sent';
      $('#friend-request-dialog').close();
      event.target.reset();
      notice('Si cette adresse correspond à un compte actif, la demande a été transmise.');
    } catch (error) {
      if (error.message === messages.PROFILE_REQUIRED) {
        $('#friend-request-dialog').close();
        showProfile(state.profile);
      } else {
        $('#friend-request-error').textContent = error.message;
        $('#friend-request-error').hidden = false;
      }
    } finally {
      setBusy(false);
      render();
    }
    await loadFriends(true);
  }

  function openTool(tool = null) {
    if (state.busy || !canEdit()) return;
    state.editing = tool;
    const form = $('#tool-form');
    form.reset();
    if (tool) {
      for (const key of ['name', 'category', 'description', 'condition']) form.elements.namedItem(key).value = tool[key];
      form.elements.namedItem('shared').checked = tool.shared;
    }
    $('#dialog-title').textContent = tool ? "Modifier l'outil" : 'Ajouter un outil';
    $('#form-error').hidden = true;
    $('#tool-dialog').showModal();
    form.elements.namedItem('name').focus();
  }

  async function saveTool(event) {
    event.preventDefault();
    if (state.busy) return;
    const data = new FormData(event.target);
    const tool = Object.fromEntries(['name', 'category', 'description', 'condition'].map(key => [key, String(data.get(key)).trim()]));
    tool.shared = data.has('shared');
    if (!tool.name) { $('#form-error').textContent = "Indiquez le nom de l'outil."; $('#form-error').hidden = false; return; }
    setBusy(true);
    try {
      const editing = state.editing;
      const saved = configured ? await request(editing ? 'update' : 'create', { id: editing?.id, tool }) : { ...tool, id: editing?.id || crypto.randomUUID() };
      if (editing) state.tools = state.tools.map(item => item.id === editing.id ? saved : item);
      else state.tools.unshift(saved);
      $('#tool-dialog').close();
      notice(editing ? 'Outil mis à jour.' : 'Votre outil a rejoint la boîte.');
    } catch (error) {
      if (error.message === messages.PROFILE_REQUIRED) {
        $('#tool-dialog').close();
        showProfile(state.profile);
      } else {
        $('#form-error').textContent = error.message;
        $('#form-error').hidden = false;
      }
    }
    finally { setBusy(false); render(); }
  }

  async function deleteTool(event) {
    event.preventDefault();
    if (state.busy || !state.deleting) return;
    setBusy(true);
    try {
      const id = state.deleting.id;
      if (configured) await request('delete', { id });
      state.tools = state.tools.filter(tool => tool.id !== id);
      $('#delete-dialog').close();
      notice('Outil supprimé.');
    } catch (error) {
      if (error.message === messages.PROFILE_REQUIRED) {
        $('#delete-dialog').close();
        showProfile(state.profile);
      } else {
        $('#delete-error').textContent = error.message;
        $('#delete-error').hidden = false;
      }
    }
    finally { setBusy(false); render(); }
  }

  async function openProfile() {
    if (state.busy || !state.user) return;
    closeAccountMenu();
    showProfile(state.profile);
    setBusy(true);
    $('#profile-error').hidden = true;
    try {
      showProfile(await request('getProfile'));
    } catch (error) {
      notice(error.message, true);
    } finally { setBusy(false); }
  }

  function showProfile(profile) {
    state.profile = profile;
    state.profileRequired = !profile.exists;
    const form = $('#profile-form');
    for (const key of ['name', 'phone', 'address']) form.elements.namedItem(key).value = profile[key];
    $('#profile-title').textContent = state.profileRequired ? 'Créer votre profil' : 'Mon profil';
    $('#profile-help').textContent = state.profileRequired
      ? 'Complétez les champs si vous le souhaitez, ou continuez sans rien renseigner. Vos amis acceptés pourront consulter les informations renseignées.'
      : 'Ces informations sont visibles uniquement par vos amis acceptés et peuvent être effacées à tout moment.';
    $('#profile-back-button').hidden = state.profileRequired;
    $('#cancel-profile-button').hidden = state.profileRequired;
    $('#logout-onboarding-button').hidden = !state.profileRequired;
    $('#save-profile-button').textContent = state.profileRequired ? 'Continuer' : 'Enregistrer';
    $('#delete-profile-button').hidden = state.profileRequired;
    setPage('profile');
    if (state.profileRequired) $('#save-profile-button').focus();
    else form.elements.namedItem('name').focus();
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (state.busy) return;
    const data = new FormData(event.target);
    const profile = Object.fromEntries(['name', 'phone', 'address'].map(key => [key, String(data.get(key) || '').trim()]));
    const onboarding = state.profileRequired;
    setBusy(true);
    $('#profile-error').hidden = true;
    try {
      state.profile = await request('saveProfile', { profile });
      state.profileRequired = false;
      if (onboarding) {
        notice('Profil créé. Bienvenue !');
        setPage('tools');
      } else notice('Profil enregistré.');
    } catch (error) {
      $('#profile-error').textContent = error.message;
      $('#profile-error').hidden = false;
    } finally { setBusy(false); }
    if (onboarding && state.profile.exists) await loadTools();
  }

  async function deleteProfile(event) {
    event.preventDefault();
    if (state.busy) return;
    setBusy(true);
    $('#profile-delete-error').hidden = true;
    try {
      await request('deleteProfile');
      state.profile = { exists: false, name: '', phone: '', address: '' };
      state.tools = [];
      $('#profile-delete-dialog').close();
      notice('Votre profil, vos demandes, vos amitiés et votre boîte à outils ont été supprimés. Créez un nouveau profil pour continuer.');
      showProfile(state.profile);
    } catch (error) {
      $('#profile-delete-error').textContent = error.message;
      $('#profile-delete-error').hidden = false;
    } finally { setBusy(false); render(); }
  }

  async function clearSession() {
    state.user = null;
    state.tools = [];
    state.friends = { friends: [], sent: [], received: [] };
    state.neighborhoodTools = [];
    setIncomingCount(0);
    state.profile = { exists: false, name: '', phone: '', address: '' };
    state.profileRequired = false;
    ['#tool-dialog', '#delete-dialog', '#profile-delete-dialog', '#friend-request-dialog', '#friend-remove-dialog'].forEach(selector => {
      if ($(selector).open) $(selector).close();
    });
    setPage('tools');
    await state.manager?.removeUser();
    closeAccountMenu();
    $('#account-menu').hidden = true;
    $('#auth-button').hidden = false;
    render();
  }

  function closeAccountMenu(returnFocus = false) {
    $('#account-menu-options').hidden = true;
    $('#account-button').setAttribute('aria-expanded', 'false');
    if (returnFocus) $('#account-button').focus();
  }

  function setAccount(email) {
    $('#account-email').textContent = email;
    $('#account-menu-email').textContent = email;
    $('#account-menu').hidden = false;
    closeAccountMenu();
    $('#auth-button').hidden = true;
  }

  async function authenticate() {
    if (!configured) { notice("La connexion sera disponible après configuration du fournisseur d'identité. La démonstration reste utilisable sans compte."); return; }
    if (state.user) {
      await clearSession();
      notice("Session locale fermée. La session du fournisseur d'identité peut rester ouverte.");
      return;
    }
    try {
      await state.manager.clearStaleState();
      await state.manager.signinRedirect(ToolboxAuth.signinArguments());
    } catch { notice("Impossible de lancer la connexion. Vérifiez la configuration OIDC et l'accès au fournisseur.", true); }
  }

  async function start() {
    $('#add-button').addEventListener('click', () => openTool());
    $('#auth-button').addEventListener('click', authenticate);
    $('#account-button').addEventListener('click', () => {
      const options = $('#account-menu-options');
      options.hidden = !options.hidden;
      $('#account-button').setAttribute('aria-expanded', String(!options.hidden));
      if (!options.hidden && state.incomingCount > 0) {
        state.friendIndicatorMoved = true;
        setIncomingCount(state.incomingCount);
      }
    });
    $('#profile-button').addEventListener('click', openProfile);
    $('#friends-button').addEventListener('click', openFriends);
    $('#sidebar-toggle').addEventListener('click', () => {
      setSidebarOpen($('#sidebar-toggle').getAttribute('aria-expanded') !== 'true');
    });
    $('#sidebar-backdrop').addEventListener('click', () => setSidebarOpen(false));
    window.matchMedia('(max-width: 850px)').addEventListener('change', event => setSidebarOpen(!event.matches));
    setSidebarOpen(!window.matchMedia('(max-width: 850px)').matches);
    $('#neighborhood-navigation').addEventListener('click', event => {
      event.preventDefault();
      openNeighborhood();
    });
    $('#friends-refresh-button').addEventListener('click', loadFriends);
    $('#neighborhood-refresh-button').addEventListener('click', loadNeighborhoodTools);
    $('#add-friend-button').addEventListener('click', () => {
      if (state.busy) return;
      $('#friend-request-error').hidden = true;
      $('#friend-request-dialog').showModal();
      $('#friend-request-form').elements.namedItem('email').focus();
    });
    $('#friend-request-form').addEventListener('submit', sendFriendRequest);
    $('#friend-remove-form').addEventListener('submit', removeFriendship);
    $('#friend-remove-dialog').addEventListener('close', () => { state.removingFriend = null; });
    for (const selector of ['#close-friend-request', '#cancel-friend-request']) {
      $(selector).addEventListener('click', () => $('#friend-request-dialog').close());
    }
    for (const [tab, selector] of [
      ['friends', '#friends-tab'], ['sent', '#sent-tab'], ['received', '#received-tab']
    ]) {
      $(selector).addEventListener('click', () => {
        state.friendsTab = tab;
        renderFriends();
      });
    }
    for (const selector of ['#neighborhood-search', '#neighborhood-category', '#neighborhood-condition']) {
      $(selector).addEventListener('input', renderNeighborhood);
    }
    $('#delete-profile-button').addEventListener('click', () => {
      $('#profile-delete-error').hidden = true;
      $('#profile-delete-dialog').showModal();
      $('#cancel-profile-delete').focus();
    });
    $('#logout-button').addEventListener('click', async () => {
      closeAccountMenu();
      await clearSession();
      notice("Session locale fermée. La session du fournisseur d'identité peut rester ouverte.");
    });
    document.addEventListener('click', event => {
      if (!$('#account-menu').contains(event.target)) closeAccountMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('#account-menu-options').hidden) {
        closeAccountMenu(true);
      }
    });
    $('#refresh-button').addEventListener('click', loadTools);
    for (const selector of ['#search', '#category-filter', '#sharing-filter']) $(selector).addEventListener('input', render);
    $('#tool-form').addEventListener('submit', saveTool);
    $('#delete-form').addEventListener('submit', deleteTool);
    $('#profile-form').addEventListener('submit', saveProfile);
    $('#profile-delete-form').addEventListener('submit', deleteProfile);
    $('#logout-onboarding-button').addEventListener('click', async () => {
      await clearSession();
      notice('Session locale fermée. La session du fournisseur d’identité peut rester ouverte.');
    });
    $('#profile-back-button').addEventListener('click', () => {
      if (!state.profileRequired) setPage('tools');
    });
    document.querySelector('.nav-item').addEventListener('click', event => {
      if (state.profileRequired) event.preventDefault();
      else setPage('tools');
    });
    $('#cancel-profile-button').addEventListener('click', () => {
      if (!state.profileRequired) setPage('tools');
    });
    for (const selector of ['#close-dialog', '#cancel-dialog']) $(selector).addEventListener('click', () => $('#tool-dialog').close());
    $('#cancel-delete').addEventListener('click', () => $('#delete-dialog').close());
    $('#cancel-profile-delete').addEventListener('click', () => $('#profile-delete-dialog').close());
    $('#cancel-friend-remove').addEventListener('click', () => {
      $('#friend-remove-dialog').close();
      state.removingFriend = null;
    });
    for (const selector of ['#tool-dialog', '#delete-dialog', '#profile-delete-dialog', '#friend-request-dialog', '#friend-remove-dialog']) {
      $(selector).addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
    }
    if (!configured) {
      $('#friends-button').hidden = true;
      $('#neighborhood-navigation').hidden = true;
      state.tools = structuredClone(demoTools);
      render();
      return;
    }
    $('#friends-button').hidden = false;
    $('#neighborhood-navigation').hidden = false;
    $('#mode-status').hidden = true;
    try {
      state.manager = new oidc.UserManager({
        authority: config.authority, client_id: config.clientId,
        redirect_uri: config.appUrl, post_logout_redirect_uri: config.appUrl,
        response_type: 'code', scope: config.scope || 'openid email profile',
        disablePKCE: false, loadUserInfo: false, automaticSilentRenew: false,
        monitorSession: false, filterProtocolClaims: false,
        userStore: new oidc.WebStorageStateStore({ store: ToolboxAuth.createPersistentUserStorage(window.localStorage) }),
        stateStore: new oidc.WebStorageStateStore({ store: window.sessionStorage }),
        extraQueryParams: config.audience ? { audience: config.audience } : {}
      });
      state.manager.events.addAccessTokenExpired(async () => { await clearSession(); notice(messages.UNAUTHORIZED, true); });
      const parameters = new URLSearchParams(location.search);
      if (parameters.has('code') || parameters.has('error')) {
        try {
          const candidate = await state.manager.signinRedirectCallback(location.href);
          state.user = ToolboxAuth.validateUser(candidate, config);
        }
        finally { history.replaceState(null, '', new URL(config.appUrl).pathname); }
        if (state.user?.expired) await clearSession();
      } else {
        const candidate = await state.manager.getUser();
        if (candidate) {
          try { state.user = ToolboxAuth.validateUser(candidate, config, { requireNonce: false }); }
          catch {
            await clearSession();
            notice(messages.UNAUTHORIZED, true);
          }
        }
      }
      if (state.user) {
        setAccount(state.user.profile.email || 'Compte connecté');
        try {
          const profile = await request('getProfile');
          if (profile.exists) {
            state.profile = profile;
            await loadTools();
          } else {
            showProfile(profile);
            notice('Créez votre profil pour accéder à votre boîte à outils.');
          }
        } catch (error) { notice(error.message, true); }
      } else if ($('#notice').hidden) notice('Connectez-vous pour retrouver votre boîte à outils.');
    } catch (error) {
      await clearSession();
      const detail = String(error?.message || '').slice(0, 160);
      notice(`La connexion n'a pas abouti${detail ? ` (${detail})` : ''}. Relancez-la depuis cet onglet ; vérifiez les URL de retour et la configuration du fournisseur.`, true);
    }
    render();
  }
  start();
})();