import { test } from 'node:test'
import { equal } from 'node:assert/strict'
import { ACCUEIL_LONGUEUR_MAX, accueilValide } from './reglages.ts'

test('accueilValide garde une adresse http(s) et complète un domaine nu', () => {
  equal(accueilValide('https://exemple.org/'), 'https://exemple.org/')
  equal(accueilValide('  http://exemple.org/a?b=1  '), 'http://exemple.org/a?b=1')
  equal(accueilValide('exemple.org'), 'https://exemple.org/')
  equal(accueilValide('localhost:3000'), 'https://localhost:3000/')
})

test('accueilValide refuse tout autre schéma, les identifiants, le vide et les valeurs aberrantes', () => {
  for (const refusee of ['', '   ', 'javascript:alert(1)', 'data:text/html,x', 'file:///C:/a.html', 'about:blank',
    ['https://nom', 'mdp@exemple.org'].join(':'), 'https://exemple .org', 'https://', `https://exemple.org/${'a'.repeat(ACCUEIL_LONGUEUR_MAX)}`]) {
    equal(accueilValide(refusee), undefined, refusee)
  }
  for (const aberrante of [undefined, null, 42, {}]) equal(accueilValide(aberrante), undefined)
})
