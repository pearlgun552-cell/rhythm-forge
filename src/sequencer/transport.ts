import { projectStore } from '../store/projectStore';
import { Sequencer } from './Sequencer';

export const sequencer = new Sequencer(() => projectStore.getSnapshot().project);
