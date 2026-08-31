import type { QueryVariable } from '@grafana/scenes';
import { selectFirstAvailableSubscription } from './subscriptionSelection';

const SUBSCRIPTION_ID = '11111111-1111-1111-1111-111111111111';

function createSubscriptionVariable(state: Pick<QueryVariable['state'], 'loading' | 'options' | 'value'>) {
  const changeValueTo = jest.fn();
  const variable = {
    state,
    changeValueTo,
  };

  return {
    changeValueTo,
    variable,
  };
}

describe('selectFirstAvailableSubscription', () => {
  test('does not clear the selection while options are temporarily empty', () => {
    const { changeValueTo, variable } = createSubscriptionVariable({
      loading: false,
      options: [],
      value: SUBSCRIPTION_ID,
    });

    selectFirstAvailableSubscription(variable);

    expect(changeValueTo).not.toHaveBeenCalled();
  });

  test('selects the first available subscription when the current value is invalid', () => {
    const { changeValueTo, variable } = createSubscriptionVariable({
      loading: false,
      options: [
        {
          label: 'Subscription',
          value: SUBSCRIPTION_ID,
        },
      ],
      value: '',
    });

    selectFirstAvailableSubscription(variable);

    expect(changeValueTo).toHaveBeenCalledWith(SUBSCRIPTION_ID);
  });
});
