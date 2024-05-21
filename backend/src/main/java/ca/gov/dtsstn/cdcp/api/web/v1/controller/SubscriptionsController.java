package ca.gov.dtsstn.cdcp.api.web.v1.controller;

import java.util.function.Predicate;

import org.mapstruct.factory.Mappers;
import org.springframework.hateoas.CollectionModel;
import org.springframework.http.HttpStatus;
import org.springframework.util.Assert;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import ca.gov.dtsstn.cdcp.api.config.SpringDocConfig.OAuthSecurityRequirement;
import ca.gov.dtsstn.cdcp.api.service.UserService;
import ca.gov.dtsstn.cdcp.api.service.domain.Subscription;
import ca.gov.dtsstn.cdcp.api.service.domain.User;
import ca.gov.dtsstn.cdcp.api.web.exception.ResourceConflictException;
import ca.gov.dtsstn.cdcp.api.web.exception.ResourceNotFoundException;
import ca.gov.dtsstn.cdcp.api.web.v1.model.SubscriptionCreateModel;
import ca.gov.dtsstn.cdcp.api.web.v1.model.SubscriptionModel;
import ca.gov.dtsstn.cdcp.api.web.v1.model.mapper.SubscriptionModelMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.NotBlank;

@Validated
@RestController
@OAuthSecurityRequirement
@RequestMapping({ "/api/v1/users/{userId}/subscriptions" })
@Tag(name = "Subscriptions", description = "Endpoint for managing subscription resources.")
public class SubscriptionsController {

	private final SubscriptionModelMapper subscriptionModelMapper = Mappers.getMapper(SubscriptionModelMapper.class);

	private final UserService userService;

	public SubscriptionsController(UserService userService) {
		Assert.notNull(userService, "userService is required; it must not be null");
		this.userService = userService;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "Create a new subscription for a user")
	public void createSubscriptionForUser(
			@NotBlank(message = "userId must not be null or blank")
			@Parameter(description = "The id of the user.", example = "00000000-0000-0000-0000-000000000000")
			@PathVariable String userId,

			@Validated @RequestBody SubscriptionCreateModel subscription) {
		final var user = userService.getUserById(userId)
			.orElseThrow(() -> new ResourceNotFoundException("No user with id=[%s] was found".formatted(userId)));

		user.getSubscriptions().stream()
			.filter(byAlertTypeCode(subscription.getAlertTypeCode())).findFirst()
			.ifPresent((existingSubscription) -> {
				throw new ResourceConflictException("A subscription with code [%s] already exists for user [%s]".formatted(subscription.getAlertTypeCode(), userId));
			});

		userService.createSubscriptionForUser(userId, subscriptionModelMapper.toDomain(subscription));
	}

	@GetMapping
	@Operation(summary = "List all subscriptions for a user")
	public CollectionModel<SubscriptionModel> getSubscriptionsByUserId(
			@NotBlank(message = "userId must not be null or blank")
			@Parameter(description = "The id of the user.", example = "00000000-0000-0000-0000-000000000000")
			@PathVariable String userId) {
		return userService.getUserById(userId)
			.map(User::getSubscriptions)
			.map(subscriptions -> subscriptionModelMapper.toModel(userId, subscriptions))
			.orElseThrow(() -> new ResourceNotFoundException("No user with id=[%s] was found".formatted(userId)));
	}

	@GetMapping({ "/{subscriptionId}" })
	@Operation(summary = "Get a subscriptions by ID")
	public SubscriptionModel getSubscriptionById(
			@NotBlank(message = "userId must not be null or blank")
			@Parameter(description = "The id of the user.", example = "00000000-0000-0000-0000-000000000000")
			@PathVariable String userId,

			@NotBlank(message = "subscriptionId must not be null or blank")
			@Parameter(description = "The id of the subscription.", example = "00000000-0000-0000-0000-000000000000")
			@PathVariable String subscriptionId) {
		final var user = userService.getUserById(userId)
			.orElseThrow(() -> new ResourceNotFoundException("No user with id=[%s] was found".formatted(userId)));

		final var subscription = user.getSubscriptions().stream()
			.filter(byId(subscriptionId)).findFirst()
			.orElseThrow(() -> new ResourceNotFoundException("No subscription with id=[%s] was found".formatted(subscriptionId)));

		return subscriptionModelMapper.toModel(userId, subscription);
	}

	private Predicate<Subscription> byAlertTypeCode(String alertTypeCode) {
		return subscription -> alertTypeCode.equals(subscription.getAlertType().getCode());
	}

	private Predicate<Subscription> byId(String id) {
		return subscription -> id.equals(subscription.getId());
	}

}
