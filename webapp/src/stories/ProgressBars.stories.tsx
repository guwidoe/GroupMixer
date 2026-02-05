import type { Meta, StoryObj } from '@storybook/react-vite';
import ProgressBars from '../components/SolverPanel/ProgressBars';
import type { SolverSettings } from '../types';

/**
 * ProgressBars shows solver progress with three metrics:
 * iteration progress, time progress, and no-improvement progress.
 */
const meta: Meta<typeof ProgressBars> = {
  title: 'Solver/ProgressBars',
  component: ProgressBars,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-2xl mx-auto">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ProgressBars>;

const defaultSettings: SolverSettings = {
  solver_type: 'SimulatedAnnealing',
  stop_conditions: {
    max_iterations: 1000000,
    time_limit_seconds: 60,
    no_improvement_iterations: 100000,
  },
  solver_params: {
    SimulatedAnnealing: {
      initial_temperature: 100,
      final_temperature: 0.1,
      cooling_schedule: 'geometric',
    },
  },
};

export const Initial: Story = {
  args: {
    solverState: {
      currentIteration: 0,
      elapsedTime: 0,
      noImprovementCount: 0,
    },
    displaySettings: defaultSettings,
  },
};

export const EarlyProgress: Story = {
  args: {
    solverState: {
      currentIteration: 150000,
      elapsedTime: 8500,
      noImprovementCount: 12000,
    },
    displaySettings: defaultSettings,
  },
};

export const MidProgress: Story = {
  args: {
    solverState: {
      currentIteration: 500000,
      elapsedTime: 30000,
      noImprovementCount: 50000,
    },
    displaySettings: defaultSettings,
  },
};

export const NearCompletion: Story = {
  args: {
    solverState: {
      currentIteration: 950000,
      elapsedTime: 57000,
      noImprovementCount: 85000,
    },
    displaySettings: defaultSettings,
  },
};

export const TimeLimitReached: Story = {
  args: {
    solverState: {
      currentIteration: 750000,
      elapsedTime: 60000,
      noImprovementCount: 45000,
    },
    displaySettings: defaultSettings,
  },
  parameters: {
    docs: {
      description: {
        story: 'Time limit reached before iteration limit - time bar at 100%.',
      },
    },
  },
};

export const NoImprovementStalling: Story = {
  args: {
    solverState: {
      currentIteration: 300000,
      elapsedTime: 18000,
      noImprovementCount: 95000,
    },
    displaySettings: defaultSettings,
  },
  parameters: {
    docs: {
      description: {
        story: 'No improvement counter getting high - might trigger early stop.',
      },
    },
  },
};

export const ShortRun: Story = {
  args: {
    solverState: {
      currentIteration: 8000,
      elapsedTime: 5000,
      noImprovementCount: 3000,
    },
    displaySettings: {
      ...defaultSettings,
      stop_conditions: {
        max_iterations: 10000,
        time_limit_seconds: 10,
        no_improvement_iterations: 5000,
      },
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Quick solver run with lower limits.',
      },
    },
  },
};

export const LongRunHighIterations: Story = {
  args: {
    solverState: {
      currentIteration: 75000000,
      elapsedTime: 450000,
      noImprovementCount: 500000,
    },
    displaySettings: {
      ...defaultSettings,
      stop_conditions: {
        max_iterations: 100000000,
        time_limit_seconds: 600,
        no_improvement_iterations: 1000000,
      },
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Very long solver run with high iteration counts.',
      },
    },
  },
};
