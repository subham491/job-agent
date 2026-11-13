import { NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Answers } from './answers';
import { Board } from './board';
import { Icon, type IconName } from './icon';
import { Matches } from './matches';
import { Profile } from './profile';
import { Store, type View } from './store';

@Component({
  imports: [NgTemplateOutlet, Icon, Matches, Board, Profile, Answers],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(Store);
  protected readonly views: { id: View; label: string; icon: IconName }[] = [
    { id: 'matches', label: 'Matches', icon: 'list' },
    { id: 'board', label: 'Board', icon: 'board' },
    { id: 'profile', label: 'Profile', icon: 'user' },
    { id: 'answers', label: 'Answers', icon: 'chat' },
  ];

  protected title(): string {
    return this.views.find((v) => v.id === this.store.view())?.label ?? '';
  }
  protected go(view: View): void {
    this.store.view.set(view);
    window.scrollTo(0, 0);
  }
}
