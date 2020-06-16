import React from 'react'
import renderer from 'react-test-renderer'
import { CampaignsSiteAdminMarketingPage } from './CampaignsSiteAdminMarketingPage'
import { IUser } from '../../../../../../shared/src/graphql/schema'

describe('CampaignsSiteAdminMarketingPage', () => {
    test('renders', () => {
        const result = renderer.create(
            <CampaignsSiteAdminMarketingPage
                authenticatedUser={{ id: 'a', username: 'alice', avatarURL: null } as IUser}
            />
        )
        expect(result.toJSON()).toMatchSnapshot()
    })
})
